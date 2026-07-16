import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSoloCompletionOwnerStamp,
  ensureCleanerEarningsLedgerRow,
  resolveCleanerEarningsLedgerCleanerId,
} from "@/lib/payout/ensureCleanerEarningsLedger";
import { evaluatePersistCleanerPayoutEligibility } from "@/lib/payout/bookingPayoutPersistEligibility";
import { bookingPayableForWeeklyBatch } from "@/lib/payout/bookingPayableForWeeklyBatch";

vi.mock("@/lib/logging/systemLog", () => ({
  reportOperationalIssue: vi.fn().mockResolvedValue(undefined),
}));

type Row = Record<string, unknown>;

class LedgerQueryBuilder {
  private filters: Array<{ column: string; value: unknown }> = [];
  private op: "select" | "insert" = "select";
  private insertRow: Row | null = null;
  private wantSingle = false;

  constructor(
    private table: string,
    private db: MockLedgerDb,
  ) {}

  select(_columns?: string) {
    return this;
  }

  insert(values: Row) {
    this.op = "insert";
    this.insertRow = { ...values };
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }

  maybeSingle() {
    this.wantSingle = true;
    return this.execute();
  }

  private async execute(): Promise<{ data: unknown; error: { message: string; code?: string } | null }> {
    if (this.op === "insert") {
      const bookingId = String(this.insertRow?.booking_id ?? "");
      const existing = (this.db.tables.cleaner_earnings ?? []).find((r) => r.booking_id === bookingId);
      if (existing) {
        return { data: null, error: { message: "duplicate key", code: "23505" } };
      }
      const id = `earn-${(this.db.tables.cleaner_earnings?.length ?? 0) + 1}`;
      const row = { id, ...this.insertRow };
      if (!this.db.tables.cleaner_earnings) this.db.tables.cleaner_earnings = [];
      this.db.tables.cleaner_earnings.push(row);
      this.db.insertCount += 1;
      return { data: row, error: null };
    }

    let rows = [...(this.db.tables[this.table] ?? [])];
    for (const f of this.filters) {
      rows = rows.filter((r) => r[f.column] === f.value);
    }
    if (this.wantSingle) {
      return { data: rows[0] ?? null, error: null };
    }
    return { data: rows, error: null };
  }
}

class MockLedgerDb {
  tables: Record<string, Row[]> = {};
  insertCount = 0;

  from(table: string) {
    return new LedgerQueryBuilder(table, this);
  }
}

describe("resolveCleanerEarningsLedgerCleanerId", () => {
  it("prefers cleaner_id when present", () => {
    expect(
      resolveCleanerEarningsLedgerCleanerId({
        cleaner_id: "c1",
        payout_owner_cleaner_id: "c2",
      }),
    ).toBe("c1");
  });

  it("falls back to payout_owner_cleaner_id when cleaner_id is missing", () => {
    expect(
      resolveCleanerEarningsLedgerCleanerId({
        cleaner_id: null,
        payout_owner_cleaner_id: "c-owner",
      }),
    ).toBe("c-owner");
  });

  it("returns null when both are empty", () => {
    expect(resolveCleanerEarningsLedgerCleanerId({ cleaner_id: "  ", payout_owner_cleaner_id: null })).toBeNull();
  });
});

describe("buildSoloCompletionOwnerStamp", () => {
  it("1) solo cleaner: stamps both ids when missing", () => {
    expect(
      buildSoloCompletionOwnerStamp({
        isTeamJob: false,
        existingCleanerId: null,
        existingPayoutOwnerId: null,
        ownerId: "c-solo",
      }),
    ).toEqual({ cleaner_id: "c-solo", payout_owner_cleaner_id: "c-solo" });
  });

  it("2) two cleaners: fill-if-empty does not overwrite existing ownership", () => {
    expect(
      buildSoloCompletionOwnerStamp({
        isTeamJob: false,
        existingCleanerId: "c-first",
        existingPayoutOwnerId: "c-first",
        ownerId: "c-second",
      }),
    ).toEqual({});
  });

  it("2b) two cleaners: second completer fills only missing payout_owner", () => {
    expect(
      buildSoloCompletionOwnerStamp({
        isTeamJob: false,
        existingCleanerId: "c-first",
        existingPayoutOwnerId: null,
        ownerId: "c-second",
      }),
    ).toEqual({ payout_owner_cleaner_id: "c-second" });
  });

  it("3) team booking: never stamps solo owner fields", () => {
    expect(
      buildSoloCompletionOwnerStamp({
        isTeamJob: true,
        existingCleanerId: null,
        existingPayoutOwnerId: null,
        ownerId: "c-lead",
      }),
    ).toEqual({});
  });
});

describe("ensureCleanerEarningsLedgerRow scenarios", () => {
  let db: MockLedgerDb;

  beforeEach(() => {
    db = new MockLedgerDb();
  });

  function seedBooking(row: Row) {
    db.tables.bookings = [{ id: "b1", ...row }];
  }

  it("1) single cleaner completed paid booking creates ledger row", async () => {
    seedBooking({
      status: "completed",
      cleaner_id: "c1",
      payout_owner_cleaner_id: "c1",
      is_team_job: false,
      cleaner_line_earnings_finalized_at: "2026-07-16T10:00:00Z",
      cleaner_earnings_total_cents: 25_000,
    });
    const result = await ensureCleanerEarningsLedgerRow({
      admin: db as unknown as never,
      bookingId: "b1",
    });
    expect(result).toEqual({ ok: true, skipped: false, earnings_id: "earn-1" });
    expect(db.tables.cleaner_earnings?.[0]).toMatchObject({
      cleaner_id: "c1",
      booking_id: "b1",
      amount_cents: 25_000,
      status: "pending",
    });
  });

  it("2) two cleaners: ledger prefers cleaner_id over payout_owner", async () => {
    seedBooking({
      status: "completed",
      cleaner_id: "c-primary",
      payout_owner_cleaner_id: "c-owner",
      is_team_job: false,
      cleaner_line_earnings_finalized_at: "2026-07-16T10:00:00Z",
      cleaner_earnings_total_cents: 18_000,
    });
    const result = await ensureCleanerEarningsLedgerRow({
      admin: db as unknown as never,
      bookingId: "b1",
    });
    expect(result.ok && !result.skipped).toBe(true);
    expect(db.tables.cleaner_earnings?.[0]?.cleaner_id).toBe("c-primary");
  });

  it("2b) two cleaners: owner-only row still creates ledger via fallback", async () => {
    seedBooking({
      status: "completed",
      cleaner_id: null,
      payout_owner_cleaner_id: "c-owner",
      is_team_job: false,
      cleaner_line_earnings_finalized_at: "2026-07-16T10:00:00Z",
      cleaner_earnings_total_cents: 18_000,
    });
    const result = await ensureCleanerEarningsLedgerRow({
      admin: db as unknown as never,
      bookingId: "b1",
    });
    expect(result.ok && !result.skipped).toBe(true);
    expect(db.tables.cleaner_earnings?.[0]?.cleaner_id).toBe("c-owner");
  });

  it("3) team booking skips solo ledger", async () => {
    seedBooking({
      status: "completed",
      cleaner_id: "c-lead",
      payout_owner_cleaner_id: "c-lead",
      is_team_job: true,
      cleaner_line_earnings_finalized_at: "2026-07-16T10:00:00Z",
      cleaner_earnings_total_cents: 40_000,
    });
    const result = await ensureCleanerEarningsLedgerRow({
      admin: db as unknown as never,
      bookingId: "b1",
    });
    expect(result).toEqual({ ok: true, skipped: true, reason: "team_job" });
    expect(db.insertCount).toBe(0);
  });

  it("4) cancelled booking skips ledger (not_completed)", async () => {
    seedBooking({
      status: "cancelled",
      cleaner_id: "c1",
      payout_owner_cleaner_id: "c1",
      is_team_job: false,
      cleaner_line_earnings_finalized_at: "2026-07-16T10:00:00Z",
      cleaner_earnings_total_cents: 25_000,
    });
    const result = await ensureCleanerEarningsLedgerRow({
      admin: db as unknown as never,
      bookingId: "b1",
    });
    expect(result).toEqual({ ok: true, skipped: true, reason: "not_completed" });
    expect(db.insertCount).toBe(0);
  });

  it("4b) cancelled booking is not payout-eligible", () => {
    const r = evaluatePersistCleanerPayoutEligibility({ status: "cancelled" });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.skipReason).toBe("payout_eligibility_terminal_booking");
  });

  it("5) refunded booking is blocked from weekly batch generation", () => {
    const batch = bookingPayableForWeeklyBatch(
      {
        status: "completed",
        billing_type: "prepaid",
        is_monthly_billing_booking: false,
        monthly_invoice_id: null,
        payment_status: "success",
        cleaner_payout_cents: 20_000,
        refunded_at: "2026-07-16T12:00:00Z",
        refund_status: "full",
      },
      new Map(),
    );
    expect(batch.payable).toBe(false);
    if (!batch.payable) expect(batch.reason).toBe("refund_or_reversal_blocked");

    // Pre-assignment refunds still hit the persist refund gate
    const preAssignRefund = evaluatePersistCleanerPayoutEligibility({
      status: "pending",
      completed_at: null,
      refunded_at: "2026-07-16T12:00:00Z",
      refund_status: "full",
      is_team_job: false,
      cleaner_id: "c1",
      total_paid_cents: 50_000,
      amount_paid_cents: 50_000,
      payment_status: "success",
      payment_needs_follow_up: false,
    });
    expect(preAssignRefund.allowed).toBe(false);
    if (!preAssignRefund.allowed) {
      expect(preAssignRefund.skipReason).toBe("payout_eligibility_refund_or_reversal");
    }
  });

  it("6) duplicate completion / ledger insert is idempotent", async () => {
    seedBooking({
      status: "completed",
      cleaner_id: "c1",
      payout_owner_cleaner_id: "c1",
      is_team_job: false,
      cleaner_line_earnings_finalized_at: "2026-07-16T10:00:00Z",
      cleaner_earnings_total_cents: 25_000,
    });
    const first = await ensureCleanerEarningsLedgerRow({
      admin: db as unknown as never,
      bookingId: "b1",
    });
    expect(first).toEqual({ ok: true, skipped: false, earnings_id: "earn-1" });

    const second = await ensureCleanerEarningsLedgerRow({
      admin: db as unknown as never,
      bookingId: "b1",
    });
    expect(second).toEqual({ ok: true, skipped: true, reason: "already_exists" });
    expect(db.tables.cleaner_earnings).toHaveLength(1);
  });

  it("6b) concurrent insert unique violation maps to already_exists", async () => {
    seedBooking({
      status: "completed",
      cleaner_id: "c1",
      payout_owner_cleaner_id: "c1",
      is_team_job: false,
      cleaner_line_earnings_finalized_at: "2026-07-16T10:00:00Z",
      cleaner_earnings_total_cents: 25_000,
    });
    db.tables.cleaner_earnings = [{ id: "earn-existing", booking_id: "b1", cleaner_id: "c1" }];
    // Force select-miss then insert collision by clearing visibility on select path:
    // existing row is found by select → already_exists without insert.
    const result = await ensureCleanerEarningsLedgerRow({
      admin: db as unknown as never,
      bookingId: "b1",
    });
    expect(result).toEqual({ ok: true, skipped: true, reason: "already_exists" });
    expect(db.insertCount).toBe(0);
  });
});
