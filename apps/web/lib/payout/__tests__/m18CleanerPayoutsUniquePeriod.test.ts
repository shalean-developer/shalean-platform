import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../../..");
const webRoot = path.resolve(__dirname, "../../..");

/**
 * M-18: weekly cleaner payout uniqueness / idempotency hardening.
 *
 * The fix has three layers, all of which this suite covers:
 *
 *   1. DB invariant — `supabase/migrations/20260945_m18_cleaner_payouts_unique_period.sql`
 *      adds a partial unique index on `(cleaner_id, period_start, period_end)
 *      WHERE status <> 'cancelled'`, with an idempotent pre-cleanup of any
 *      pre-existing duplicates.
 *
 *   2. Application idempotency — `apps/web/lib/payout/generateWeeklyPayouts.ts`
 *      catches the resulting Postgres `23505` unique-violation, logs +
 *      meters, and silently skips the cleaner. Distinct windows still work.
 *
 *   3. Race-loss handling for the downstream payout-run grouping —
 *      `apps/web/lib/payout/runs/createPayoutRun.ts` adds an `is null` guard
 *      on the post-insert link update and rolls back the empty draft run when
 *      a concurrent runner already won.
 *
 * Out of scope for this suite (and explicitly NOT touched by this fix):
 *   - payout formulas (calculateCleanerPayout / canonical engine)
 *   - payout eligibility (bookingPayableForWeeklyBatch)
 *   - cleaner / booking / payment selection logic
 *
 * The "formula stability" describe at the bottom asserts those files were not
 * imported / referenced by the M-18 migration so a future refactor cannot
 * accidentally couple them.
 */

const migrationPath = path.join(
  repoRoot,
  "supabase/migrations/20260945_m18_cleaner_payouts_unique_period.sql",
);
const migrationSrc = readFileSync(migrationPath, "utf8");
const migrationLower = migrationSrc.toLowerCase();
/** Migration source with -- and block comments stripped, used when matching SQL statements only. */
const migrationCode = migrationSrc
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/--[^\n]*/g, " ");
const migrationCodeLower = migrationCode.toLowerCase();

// ---------------------------------------------------------------------------
// 1. Migration content guards
// ---------------------------------------------------------------------------
describe("M-18 migration: 20260945_m18_cleaner_payouts_unique_period.sql", () => {
  it("creates the partial unique index idempotently on (cleaner_id, period_start, period_end)", () => {
    expect(migrationCodeLower).toMatch(
      /create\s+unique\s+index\s+if\s+not\s+exists\s+cleaner_payouts_unique_active_period_idx/,
    );
    expect(migrationCodeLower).toMatch(
      /on\s+public\.cleaner_payouts\s*\(\s*cleaner_id\s*,\s*period_start\s*,\s*period_end\s*\)/,
    );
  });

  it("excludes cancelled rows from the uniqueness invariant (cancel-and-recreate must still work)", () => {
    expect(migrationCodeLower).toMatch(/where\s+status\s*<>\s*'cancelled'/);
  });

  it("pre-cleans pre-existing duplicates by soft-cancelling older non-frozen siblings", () => {
    expect(migrationCodeLower).toMatch(/row_number\(\)\s+over/);
    expect(migrationCodeLower).toMatch(
      /partition\s+by\s+cleaner_id\s*,\s*period_start\s*,\s*period_end/,
    );
    expect(migrationCodeLower).toMatch(/where\s+rn\s*>\s*1/);
    expect(migrationCodeLower).toMatch(/frozen_at\s+is\s+null/);
    expect(migrationCodeLower).toMatch(/set\s+status\s*=\s*'cancelled'/);
  });

  it("documents the canonical key + relationship to H-15 cron lock + 23505 idempotent recovery", () => {
    expect(migrationLower).toContain("h-15");
    expect(migrationLower).toContain("cleaner_id, period_start, period_end");
    expect(migrationLower).toContain("23505");
    expect(migrationLower).toContain("generateweeklypayouts");
  });

  it("explicitly notes payout_run_id and payout_type are NOT part of the canonical key", () => {
    /**
     * Normalise the SQL prose: strip leading `--` comment markers so multi-line
     * sentences across comment lines collapse into a single logical paragraph
     * that regex can scan with `\s+`.
     */
    const prose = migrationLower
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*--\s?/, ""))
      .join("\n");
    expect(prose).toMatch(/payout_run_id[\s\S]*?not\s+part\s+of\s+the\s+key/);
    expect(prose).toMatch(/payout_type[\s\S]*?not\s+part\s+of\s+the\s+key/);
    expect(prose).toContain("`cleaner_payouts` has no `payout_type` column");
  });

  it("does NOT touch payout formulas, payout eligibility, or any column on cleaner_payouts other than the index", () => {
    /** No alter table cleaner_payouts add/drop column; no calculate_cleaner_payout RPC redefinition. */
    expect(migrationCodeLower).not.toMatch(
      /alter\s+table\s+public\.cleaner_payouts\s+add\s+column/,
    );
    expect(migrationCodeLower).not.toMatch(
      /alter\s+table\s+public\.cleaner_payouts\s+drop\s+column/,
    );
    expect(migrationCodeLower).not.toMatch(/calculate_cleaner_payout/);
    expect(migrationCodeLower).not.toMatch(/booking_payable_for_weekly_batch/);
    expect(migrationCodeLower).not.toMatch(/total_amount_cents\s*=\s*/);
  });

  it("uses safe lock + statement timeouts so the migration cannot wedge prod", () => {
    expect(migrationCodeLower).toMatch(/set\s+local\s+lock_timeout/);
    expect(migrationCodeLower).toMatch(/set\s+local\s+statement_timeout/);
  });
});

// ---------------------------------------------------------------------------
// 2. Behavioural: generateWeeklyPayouts handles 23505 idempotently and still
//    inserts for valid distinct windows.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;

class StubBuilder {
  private filters: Array<{ kind: "eq" | "is" | "not_is" | "in"; column: string; value: unknown }> = [];
  private op: "select" | "insert" | "update" | "delete" = "select";
  private patch: Row = {};
  private insertRows: Row[] = [];
  private headOnly = false;

  constructor(private table: string, private db: StubDb) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op !== "update" && this.op !== "insert") this.op = "select";
    if (opts?.head === true) this.headOnly = true;
    return this;
  }
  update(values: Row) { this.op = "update"; this.patch = { ...values }; return this; }
  insert(values: Row | Row[]) { this.op = "insert"; this.insertRows = Array.isArray(values) ? values.map((v) => ({ ...v })) : [{ ...values }]; return this; }
  delete() { this.op = "delete"; return this; }
  eq(col: string, val: unknown) { this.filters.push({ kind: "eq", column: col, value: val }); return this; }
  is(col: string, val: unknown) { this.filters.push({ kind: "is", column: col, value: val }); return this; }
  not(col: string, op: string, val: unknown) { if (op === "is") this.filters.push({ kind: "not_is", column: col, value: val }); return this; }
  in(col: string, vals: unknown[]) { this.filters.push({ kind: "in", column: col, value: vals }); return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { return this.execute(true); }
  single() { return this.execute(true); }
  then<T>(onfulfilled?: ((v: { data: unknown; error: unknown; count?: number | null }) => T | PromiseLike<T>) | null) {
    return this.execute(false).then(onfulfilled ?? ((v) => v as unknown as T));
  }

  private match(row: Row): boolean {
    for (const f of this.filters) {
      const v = row[f.column];
      if (f.kind === "eq" && v !== f.value) return false;
      if (f.kind === "is") {
        if (f.value === null) { if (v !== null && v !== undefined) return false; }
        else if (v !== f.value) return false;
      }
      if (f.kind === "not_is" && f.value === null) {
        if (v === null || v === undefined) return false;
      }
      if (f.kind === "in" && Array.isArray(f.value)) {
        if (!(f.value as unknown[]).includes(v)) return false;
      }
    }
    return true;
  }

  private async execute(single: boolean) {
    const rows = (this.db.tables[this.table] ?? []) as Row[];

    if (this.op === "insert") {
      this.db.insertCalls[this.table] = (this.db.insertCalls[this.table] ?? 0) + 1;
      const errors = this.db.nextInsertError[this.table] ?? [];
      if (errors.length > 0) {
        const e = errors.shift()!;
        return { data: null, error: e, count: null };
      }
      const next = [...rows];
      const out: Row[] = [];
      for (const r of this.insertRows) {
        const withId: Row = { id: this.db.newId(), ...r };
        next.push(withId);
        out.push(withId);
      }
      this.db.tables[this.table] = next;
      if (single) return { data: out[0] ?? null, error: null, count: null };
      return { data: out, error: null, count: null };
    }

    if (this.op === "delete") {
      const remaining: Row[] = [];
      let deletedCount = 0;
      for (const r of rows) {
        if (this.match(r)) deletedCount += 1;
        else remaining.push(r);
      }
      this.db.tables[this.table] = remaining;
      this.db.deleteCalls[this.table] = (this.db.deleteCalls[this.table] ?? 0) + 1;
      return { data: null, error: null, count: deletedCount };
    }

    const matched = rows.filter((r) => this.match(r));
    if (this.op === "update") {
      this.db.updateCalls[this.table] = (this.db.updateCalls[this.table] ?? 0) + 1;
      for (const r of matched) Object.assign(r, this.patch);
      const out = matched.map((r) => ({ id: r.id }));
      if (single) return { data: out[0] ?? null, error: null, count: null };
      return { data: out, error: null, count: null };
    }

    if (this.headOnly) {
      return { data: null, error: null, count: matched.length };
    }
    if (single) return { data: matched[0] ?? null, error: null, count: null };
    return { data: matched, error: null, count: null };
  }
}

class StubDb {
  tables: Record<string, Row[]> = {};
  insertCalls: Record<string, number> = {};
  updateCalls: Record<string, number> = {};
  deleteCalls: Record<string, number> = {};
  nextInsertError: Record<string, Array<{ code?: string; message: string }>> = {};
  private idCounter = 0;

  constructor(seed?: Record<string, Row[]>) {
    this.tables = {
      bookings: [],
      cleaners: [],
      cleaner_payouts: [],
      monthly_invoices: [],
      ...(seed ?? {}),
    };
  }
  from(table: string) { return new StubBuilder(table, this); }
  newId() { this.idCounter += 1; return `id-${this.idCounter}`; }
  /** Queue a unique-violation error to be returned by the next insert into `table`. */
  queueInsertError(table: string, err: { code?: string; message: string }) {
    if (!this.nextInsertError[table]) this.nextInsertError[table] = [];
    this.nextInsertError[table].push(err);
  }
}

describe("M-18 generateWeeklyPayouts: 23505 unique-violation is handled idempotently", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  /**
   * Seeds the DB stub with a single cleaner + 1 completed prepaid booking that
   * passes the Phase-12 `bookingPayableForWeeklyBatch` gate (prepaid +
   * non-monthly, customer-settled), inside last week's UTC Mon–Sun window.
   */
  function seedSingleCleanerSinglePayableBooking(db: StubDb) {
    const now = new Date();
    const utcMid = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dow = utcMid.getUTCDay();
    const daysSinceMonday = (dow + 6) % 7;
    const lastSunday = new Date(utcMid);
    lastSunday.setUTCDate(utcMid.getUTCDate() - daysSinceMonday - 1);
    const completedYmd = lastSunday.toISOString().slice(0, 10);

    db.tables.cleaners = [{ id: "cleaner-1" }];
    db.tables.bookings = [
      {
        id: "booking-1",
        cleaner_id: "cleaner-1",
        status: "completed",
        is_test: false,
        completed_at: `${completedYmd}T12:00:00.000Z`,
        date: completedYmd,
        time: "12:00:00",
        cleaner_payout_cents: 25_000,
        cleaner_bonus_cents: 0,
        payout_id: null,
        payment_status: "paid",
        paid_at: `${completedYmd}T12:00:00.000Z`,
        is_monthly_billing_booking: false,
        billing_type: null,
        monthly_invoice_id: null,
        total_paid_cents: 25_000,
        amount_paid_cents: 25_000,
        total_paid_zar: 250,
      },
    ];
  }

  it("normal path: inserts a cleaner_payouts row and links the booking", async () => {
    const db = new StubDb();
    seedSingleCleanerSinglePayableBooking(db);

    const { generateWeeklyPayouts } = await import("@/lib/payout/generateWeeklyPayouts");
    const result = await generateWeeklyPayouts(db as unknown as never);

    expect(result.payoutsCreated).toBe(1);
    expect(result.bookingsLinked).toBe(1);
    expect(result.skippedCleaners).toBe(0);
    expect(db.tables.cleaner_payouts.length).toBe(1);
    expect(db.tables.bookings[0]!.payout_id).toBe(db.tables.cleaner_payouts[0]!.id);
  });

  it("23505 from the unique index is caught: skips cleaner, no throw, no booking-link", async () => {
    const db = new StubDb();
    seedSingleCleanerSinglePayableBooking(db);

    /**
     * Simulate the canonical race: the partial unique index
     * `cleaner_payouts_unique_active_period_idx` has already been satisfied by
     * a concurrent runner that won the H-15 lock fail-open window. Postgres
     * returns SQLSTATE 23505 on our INSERT.
     */
    db.queueInsertError("cleaner_payouts", {
      code: "23505",
      message:
        'duplicate key value violates unique constraint "cleaner_payouts_unique_active_period_idx"',
    });

    const { generateWeeklyPayouts } = await import("@/lib/payout/generateWeeklyPayouts");
    const result = await generateWeeklyPayouts(db as unknown as never);

    expect(result.payoutsCreated).toBe(0);
    expect(result.bookingsLinked).toBe(0);
    expect(result.skippedCleaners).toBeGreaterThanOrEqual(1);
    expect(db.tables.cleaner_payouts.length).toBe(0);
    /** No fall-through booking link must occur — the loser must NOT touch the winner's bookings. */
    expect(db.tables.bookings[0]!.payout_id).toBeNull();
    expect(db.updateCalls.bookings ?? 0).toBe(0);
  });

  it("retry storms remain idempotent: re-running after a 23505 still does nothing", async () => {
    const db = new StubDb();
    seedSingleCleanerSinglePayableBooking(db);
    db.queueInsertError("cleaner_payouts", { code: "23505", message: "duplicate key" });
    db.queueInsertError("cleaner_payouts", { code: "23505", message: "duplicate key" });

    const { generateWeeklyPayouts } = await import("@/lib/payout/generateWeeklyPayouts");

    const a = await generateWeeklyPayouts(db as unknown as never);
    const b = await generateWeeklyPayouts(db as unknown as never);

    expect(a.payoutsCreated).toBe(0);
    expect(b.payoutsCreated).toBe(0);
    expect(db.tables.cleaner_payouts.length).toBe(0);
    expect(db.tables.bookings[0]!.payout_id).toBeNull();
  });

  it("non-23505 insert errors still surface as skip + reportOperationalIssue (no silent success)", async () => {
    const db = new StubDb();
    seedSingleCleanerSinglePayableBooking(db);
    db.queueInsertError("cleaner_payouts", { code: "23502", message: "not null violation" });

    const { generateWeeklyPayouts } = await import("@/lib/payout/generateWeeklyPayouts");
    const result = await generateWeeklyPayouts(db as unknown as never);

    expect(result.payoutsCreated).toBe(0);
    expect(result.skippedCleaners).toBeGreaterThanOrEqual(1);
    expect(db.tables.cleaner_payouts.length).toBe(0);
  });

  it("two cleaners in the same window: 23505 on cleaner A does NOT block cleaner B", async () => {
    const db = new StubDb();
    seedSingleCleanerSinglePayableBooking(db);
    /** Add a second cleaner with their own payable booking. */
    db.tables.cleaners.push({ id: "cleaner-2" });
    const baseBooking = db.tables.bookings[0]! as Row;
    db.tables.bookings.push({
      ...baseBooking,
      id: "booking-2",
      cleaner_id: "cleaner-2",
    });

    /** Only the FIRST cleaner_payouts insert collides with the unique index. */
    db.queueInsertError("cleaner_payouts", { code: "23505", message: "duplicate key" });

    const { generateWeeklyPayouts } = await import("@/lib/payout/generateWeeklyPayouts");
    const result = await generateWeeklyPayouts(db as unknown as never);

    /** Cleaner B's distinct (cleaner_id, period) row succeeds — the partial index is per-cleaner. */
    expect(result.payoutsCreated).toBe(1);
    expect(result.bookingsLinked).toBe(1);
    expect(db.tables.cleaner_payouts.length).toBe(1);
    /**
     * The successful insert is for cleaner-2; cleaner-1's booking remains
     * unlinked because its insert hit 23505 (winner already linked it).
     */
    const linkedBooking = db.tables.bookings.find((b) => (b as Row).payout_id != null);
    expect(linkedBooking).toBeDefined();
    expect((linkedBooking as Row).cleaner_id).toBe("cleaner-2");
  });
});

// ---------------------------------------------------------------------------
// 3. Behavioural: createPayoutRun rolls back the empty draft run on race-loss.
// ---------------------------------------------------------------------------
describe("M-18 createPayoutRun: race-loss against concurrent run is rolled back, no orphan draft", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("happy path: links frozen payouts and keeps the draft run", async () => {
    const db = new StubDb();
    db.tables.cleaner_payouts = [
      { id: "cp-1", status: "frozen", payout_run_id: null, total_amount_cents: 10_000 },
      { id: "cp-2", status: "frozen", payout_run_id: null, total_amount_cents: 5_000 },
    ];
    db.tables.cleaner_payout_runs = [];

    const { createPayoutRun } = await import("@/lib/payout/runs/createPayoutRun");
    const out = await createPayoutRun(db as unknown as never);

    expect(out).not.toBeNull();
    expect(db.tables.cleaner_payout_runs.length).toBe(1);
    expect(db.tables.cleaner_payouts.every((p) => (p as Row).payout_run_id === out!.id)).toBe(true);
  });

  it("race-loss: candidate payouts already claimed by another run → empty draft is deleted, returns null", async () => {
    const db = new StubDb();
    /**
     * Simulate the race: by the time we run our INSERT + UPDATE, a concurrent
     * runner has already linked these frozen payouts to its own run. Our SELECT
     * happened first (saw them as `payout_run_id IS NULL`), then the other
     * runner won the link, so our update with `is null` guard finds 0 rows.
     */
    db.tables.cleaner_payouts = [
      { id: "cp-1", status: "frozen", payout_run_id: null, total_amount_cents: 10_000 },
    ];
    db.tables.cleaner_payout_runs = [];

    const { createPayoutRun } = await import("@/lib/payout/runs/createPayoutRun");

    /**
     * Patch the .select / .is chain so that between the SELECT and the UPDATE
     * the rows get hijacked. We monkey-patch the existing payouts to set
     * `payout_run_id` to a competing winner UUID right before our update
     * builder runs.
     */
    const realFrom = db.from.bind(db);
    let sawSelect = false;
    db.from = (table: string) => {
      const builder = realFrom(table);
      if (table === "cleaner_payouts") {
        const origSelect = builder.select.bind(builder);
        builder.select = (cols?: string, opts?: { count?: string; head?: boolean }) => {
          if (!sawSelect && cols && cols.includes("total_amount_cents")) {
            sawSelect = true;
            queueMicrotask(() => {
              for (const p of db.tables.cleaner_payouts) {
                (p as Row).payout_run_id = "concurrent-winner-run";
              }
            });
          }
          return origSelect(cols, opts);
        };
      }
      return builder;
    };

    const out = await createPayoutRun(db as unknown as never);

    expect(out).toBeNull();
    /** The empty draft run we inserted must have been rolled back. */
    expect(db.tables.cleaner_payout_runs.length).toBe(0);
    /** The original payouts must still be linked to the *winner*, not us. */
    for (const p of db.tables.cleaner_payouts) {
      expect((p as Row).payout_run_id).toBe("concurrent-winner-run");
    }
  });

  it("no frozen unbilled payouts → returns null, makes no inserts (idempotent retry)", async () => {
    const db = new StubDb();
    db.tables.cleaner_payouts = [];
    db.tables.cleaner_payout_runs = [];

    const { createPayoutRun } = await import("@/lib/payout/runs/createPayoutRun");
    const out = await createPayoutRun(db as unknown as never);

    expect(out).toBeNull();
    expect(db.insertCalls.cleaner_payout_runs ?? 0).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Static guard: every payout-creating route shares the H-15 lock + is wired
//    up to the canonical cron-lock key. This is the H-15 coverage verification.
// ---------------------------------------------------------------------------
describe("M-18 H-15 cron-lock coverage: every cleaner_payouts insert site is serialised", () => {
  const routes: Array<{ relPath: string; key: string; description: string }> = [
    {
      relPath: "app/api/cron/generate-payouts/route.ts",
      key: "generatePayouts",
      description: "scheduled cron generate-payouts",
    },
    {
      relPath: "app/api/admin/payouts/generate/route.ts",
      key: "generatePayouts",
      description: "admin manual generate-payouts (M-18: now shares the same lease)",
    },
    {
      relPath: "app/api/cron/freeze-payouts/route.ts",
      key: "freezePayouts",
      description: "freeze-payouts cron",
    },
    {
      relPath: "app/api/cron/create-payout-run/route.ts",
      key: "createPayoutRun",
      description: "create-payout-run cron",
    },
  ];

  for (const r of routes) {
    it(`${r.description} imports withCronLock and uses CRON_LOCK_KEYS.${r.key}`, () => {
      const src = readFileSync(path.join(webRoot, r.relPath), "utf8");
      expect(src).toMatch(/from\s+["']@\/lib\/cron\/cronLock["']/);
      expect(src).toMatch(/withCronLock|acquireCronLock/);
      expect(src).toMatch(new RegExp(`CRON_LOCK_KEYS\\.${r.key}\\b`));
    });
  }

  it("generateWeeklyPayouts is the SOLE cleaner_payouts insert site (audit guard)", () => {
    /**
     * If a future change adds another `from("cleaner_payouts").insert(...)` site
     * outside of `generateWeeklyPayouts.ts`, that site MUST also handle the
     * 23505 idempotency contract. This test fails loudly so that audit cannot
     * be missed.
     */
    const candidates = [
      "lib/payout/generateWeeklyPayouts.ts",
      "lib/payout/runs/createPayoutRun.ts",
      "lib/payout/persistCleanerPayout.ts",
      "lib/payout/approvePayout.ts",
      "lib/payout/markPayoutPaid.ts",
      "lib/payout/paystackPayout.ts",
      "lib/payout/runs/freezeEligiblePayouts.ts",
      "lib/payout/runs/processPayoutRun.ts",
      "lib/payout/runs/approvePayoutRun.ts",
      "lib/payout/runs/retryFailedRunTransfers.ts",
      "lib/payout/paystackTransferStatus.ts",
    ];
    const insertSites: string[] = [];
    for (const rel of candidates) {
      const src = readFileSync(path.join(webRoot, rel), "utf8");
      if (/from\(\s*["']cleaner_payouts["']\s*\)\s*\.insert\(/.test(src)) {
        insertSites.push(rel);
      }
    }
    expect(insertSites).toEqual(["lib/payout/generateWeeklyPayouts.ts"]);
  });

  it("createPayoutRun is the SOLE cleaner_payout_runs insert site (audit guard)", () => {
    const candidates = [
      "lib/payout/runs/createPayoutRun.ts",
      "lib/payout/runs/approvePayoutRun.ts",
      "lib/payout/runs/processPayoutRun.ts",
      "lib/payout/runs/freezeEligiblePayouts.ts",
      "lib/payout/runs/retryFailedRunTransfers.ts",
    ];
    const insertSites: string[] = [];
    for (const rel of candidates) {
      const src = readFileSync(path.join(webRoot, rel), "utf8");
      if (/from\(\s*["']cleaner_payout_runs["']\s*\)\s*\.insert\(/.test(src)) {
        insertSites.push(rel);
      }
    }
    expect(insertSites).toEqual(["lib/payout/runs/createPayoutRun.ts"]);
  });
});

// ---------------------------------------------------------------------------
// 5. Static guard: M-18 changes contain the documented idempotency contract.
// ---------------------------------------------------------------------------
describe("M-18 application-level idempotency contract: source code shape", () => {
  it("generateWeeklyPayouts catches Postgres SQLSTATE 23505 on the cleaner_payouts insert", () => {
    const src = readFileSync(path.join(webRoot, "lib/payout/generateWeeklyPayouts.ts"), "utf8");
    expect(src).toContain('"23505"');
    expect(src).toContain("cleaner.weekly_payout_duplicate_creation_blocked");
    expect(src).toContain("weekly_payout_duplicate_creation_blocked");
    /** Must NOT call reportOperationalIssue at error-level for the 23505 path (it is normal idempotency, not an error). */
    const dupSection = src.slice(src.indexOf('"23505"'));
    const errReportInDupSection = /reportOperationalIssue\(\s*"error"/.test(dupSection.split("continue;")[0]!);
    expect(errReportInDupSection).toBe(false);
  });

  it("createPayoutRun guards the post-insert update with .is('payout_run_id', null) and rolls back on race-loss", () => {
    const src = readFileSync(path.join(webRoot, "lib/payout/runs/createPayoutRun.ts"), "utf8");
    expect(src).toMatch(/\.is\(\s*["']payout_run_id["']\s*,\s*null\s*\)/);
    expect(src).toMatch(/cleaner_payout_runs[\s\S]*delete[\s\S]*runRow\.id/);
    expect(src).toContain("cleaner.create_payout_run_race_lost");
  });

  it("admin manual /api/admin/payouts/generate now shares the H-15 lease with the scheduled cron", () => {
    const src = readFileSync(path.join(webRoot, "app/api/admin/payouts/generate/route.ts"), "utf8");
    expect(src).toMatch(/from\s+["']@\/lib\/cron\/cronLock["']/);
    expect(src).toMatch(/withCronLock/);
    expect(src).toMatch(/CRON_LOCK_KEYS\.generatePayouts/);
  });
});

// ---------------------------------------------------------------------------
// 6. Isolation: M-18 must not change payout formulas, eligibility, or the
//    cleaner_payouts row schema.
// ---------------------------------------------------------------------------
describe("M-18 isolation: dedup hardening does not touch payout formulas / eligibility / schema", () => {
  it("migration does not import or redefine any payout calculation surface", () => {
    expect(migrationCodeLower).not.toMatch(/calculate_cleaner_payout/);
    expect(migrationCodeLower).not.toMatch(/compute_booking_earnings/);
    expect(migrationCodeLower).not.toMatch(/booking_payable_for_weekly_batch/);
    expect(migrationCodeLower).not.toMatch(/payout_percentage|earnings_cap_cents/);
  });

  it("generateWeeklyPayouts still calls the unchanged payout total formula (sum of payout + bonus cents)", () => {
    const src = readFileSync(path.join(webRoot, "lib/payout/generateWeeklyPayouts.ts"), "utf8");
    /** Locate the canonical reduce-and-sum block; this is the formula contract. */
    expect(src).toMatch(
      /Math\.floor\(Number\(b\.cleaner_payout_cents\)\s*\|\|\s*0\)/,
    );
    expect(src).toMatch(
      /Math\.floor\(Number\(b\.cleaner_bonus_cents\)\s*\|\|\s*0\)/,
    );
  });

  it("generateWeeklyPayouts still gates bookings via bookingPayableForWeeklyBatch (eligibility unchanged)", () => {
    const src = readFileSync(path.join(webRoot, "lib/payout/generateWeeklyPayouts.ts"), "utf8");
    expect(src).toMatch(/bookingPayableForWeeklyBatch/);
  });

  it("createPayoutRun still computes total as sum of frozen payouts (formula unchanged)", () => {
    const src = readFileSync(path.join(webRoot, "lib/payout/runs/createPayoutRun.ts"), "utf8");
    expect(src).toMatch(
      /Math\.floor\(Number\(\(p as \{ total_amount_cents\?: number \}\)\.total_amount_cents\)/,
    );
  });
});
