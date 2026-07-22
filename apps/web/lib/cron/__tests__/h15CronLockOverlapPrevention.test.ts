import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { readRepositoryMigration } from "@/lib/audit/resolveRepositoryMigration";
import { acquireCronLock, releaseCronLock, withCronLock } from "../cronLock";
import { CRON_LOCK_KEYS } from "../cronLockKeys";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * H-15: cron concurrency lock — behavioural + content-guard tests.
 *
 * Behavioural tests use a stateful mock of `try_acquire_cron_lock` / `release_cron_lock`
 * to prove:
 *   - Two concurrent runners cannot both enter the protected work.
 *   - The lease is released even when the wrapped fn throws.
 *   - Lock RPC errors fail-open (work still runs) so a Supabase blip doesn't DOS cron.
 *
 * Content-guard tests assert that every financial / payout / recurring / assignment / booking
 * cron route imports the lock helper + a key from CRON_LOCK_KEYS, so future regressions are
 * caught automatically.
 */

type StoredLease = { holderId: string; expiresAtMs: number };

function makeLockMock() {
  const store = new Map<string, StoredLease>();
  const calls: { rpc: string; args: Record<string, unknown> }[] = [];
  const failNextAcquire: { value: { error: { message: string } } | null } = { value: null };

  const admin = {
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ rpc: name, args });
      if (name === "try_acquire_cron_lock") {
        if (failNextAcquire.value) {
          const out = failNextAcquire.value;
          failNextAcquire.value = null;
          return Promise.resolve({ data: null, ...out });
        }
        const jobName = String(args.p_job_name ?? "");
        const holderId = String(args.p_holder_id ?? "");
        const leaseSeconds = Math.max(30, Math.min(3600, Number(args.p_lease_seconds ?? 600)));
        if (!jobName || !holderId) return Promise.resolve({ data: false, error: null });
        const now = Date.now();
        const cur = store.get(jobName);
        if (cur && cur.expiresAtMs > now && cur.holderId !== holderId) {
          return Promise.resolve({ data: false, error: null });
        }
        store.set(jobName, { holderId, expiresAtMs: now + leaseSeconds * 1000 });
        return Promise.resolve({ data: true, error: null });
      }
      if (name === "release_cron_lock") {
        const jobName = String(args.p_job_name ?? "");
        const holderId = String(args.p_holder_id ?? "");
        const cur = store.get(jobName);
        if (cur && cur.holderId === holderId) {
          store.delete(jobName);
          return Promise.resolve({ data: true, error: null });
        }
        return Promise.resolve({ data: false, error: null });
      }
      return Promise.resolve({ data: null, error: { message: `unhandled rpc ${name}` } });
    },
  };

  return { admin, store, calls, failNextAcquire };
}

describe("H-15 cron lock — behavioural", () => {
  let admin: ReturnType<typeof makeLockMock>["admin"];
  let store: ReturnType<typeof makeLockMock>["store"];
  let calls: ReturnType<typeof makeLockMock>["calls"];
  let failNextAcquire: ReturnType<typeof makeLockMock>["failNextAcquire"];

  beforeEach(() => {
    ({ admin, store, calls, failNextAcquire } = makeLockMock());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("first acquire succeeds, second concurrent acquire is rejected", async () => {
    const a = await acquireCronLock(admin as never, { jobName: "test:job-a", leaseSeconds: 60 });
    expect(a.ok).toBe(true);

    const b = await acquireCronLock(admin as never, { jobName: "test:job-a", leaseSeconds: 60 });
    expect(b.ok).toBe(false);
    if (!b.ok) {
      expect(b.reason).toBe("concurrent_run");
      expect(b.jobName).toBe("test:job-a");
    }
  });

  it("after release, a different holder can acquire", async () => {
    const a = await acquireCronLock(admin as never, { jobName: "test:job-b" });
    expect(a.ok).toBe(true);
    if (!a.ok) throw new Error("unreachable");

    await releaseCronLock(admin as never, a.jobName, a.holderId);

    const b = await acquireCronLock(admin as never, { jobName: "test:job-b" });
    expect(b.ok).toBe(true);
  });

  it("withCronLock skips invocation of fn if lock is held by another runner", async () => {
    const fn = vi.fn(async () => "ran");

    const r1 = await withCronLock(admin as never, { jobName: "test:job-c" }, fn);
    expect(r1.skipped).toBe(false);
    if (r1.skipped) throw new Error("unreachable");
    expect(r1.ranIt).toBe("ran");
    expect(fn).toHaveBeenCalledTimes(1);

    // A second runner attempts to enter while r1's lease is being held.
    // To simulate concurrency, we manually re-claim the lease before r1's release would normally land.
    store.set("test:job-c", { holderId: "OTHER", expiresAtMs: Date.now() + 60_000 });

    const r2 = await withCronLock(admin as never, { jobName: "test:job-c" }, fn);
    expect(r2.skipped).toBe(true);
    if (!r2.skipped) throw new Error("unreachable");
    expect(r2.reason).toBe("concurrent_run");
    expect(fn).toHaveBeenCalledTimes(1); // Not re-invoked.
  });

  it("withCronLock releases the lease even when fn throws", async () => {
    const err = new Error("fn boom");
    await expect(
      withCronLock(admin as never, { jobName: "test:job-d" }, async () => {
        throw err;
      }),
    ).rejects.toBe(err);

    expect(store.has("test:job-d")).toBe(false);

    // A new runner should now be able to acquire.
    const r = await acquireCronLock(admin as never, { jobName: "test:job-d" });
    expect(r.ok).toBe(true);
  });

  it("normal single-run execution shape is unchanged: { skipped: false, ranIt }", async () => {
    const result = await withCronLock(
      admin as never,
      { jobName: "test:job-e" },
      async () => ({ count: 5 }),
    );
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(false);
    if (!result.skipped) {
      expect(result.ranIt).toEqual({ count: 5 });
    }
  });

  it("acquire RPC error fails OPEN (runs work) so the lock cannot DOS cron", async () => {
    failNextAcquire.value = { error: { message: "transient db error" } };

    const fn = vi.fn(async () => "still ran");
    const result = await withCronLock(admin as never, { jobName: "test:job-f" }, fn);

    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(false);
    if (!result.skipped) {
      expect(result.ranIt).toBe("still ran");
      expect(result.degraded).toBe(true);
    }
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("release does not delete a lease held by a different holder (owner-checked)", async () => {
    const a = await acquireCronLock(admin as never, { jobName: "test:job-g" });
    expect(a.ok).toBe(true);
    if (!a.ok) throw new Error("unreachable");

    await releaseCronLock(admin as never, "test:job-g", "00000000-0000-0000-0000-000000000000");

    // Lease is still held — the wrong-holder release was a no-op.
    const b = await acquireCronLock(admin as never, { jobName: "test:job-g" });
    expect(b.ok).toBe(false);
  });

  it("blank job_name or empty holder is rejected without touching store", async () => {
    const a = await acquireCronLock(admin as never, { jobName: "" });
    expect(a.ok).toBe(false);
    if (!a.ok) {
      expect(a.reason).toBe("concurrent_run");
    }
    expect(store.size).toBe(0);
  });

  it("acquire rpc is invoked with the configured lease seconds (clamped helper-side)", async () => {
    await acquireCronLock(admin as never, { jobName: "test:lease", leaseSeconds: 7200 });
    const lastAcq = calls.filter((c) => c.rpc === "try_acquire_cron_lock").at(-1);
    expect(lastAcq).toBeTruthy();
    if (lastAcq) {
      // 7200 should be clamped to 3600 by the helper before the RPC call.
      expect(lastAcq.args.p_lease_seconds).toBe(3600);
    }

    await acquireCronLock(admin as never, { jobName: "test:lease-min", leaseSeconds: 5 });
    const minAcq = calls.filter((c) => c.rpc === "try_acquire_cron_lock").at(-1);
    if (minAcq) {
      expect(minAcq.args.p_lease_seconds).toBe(30);
    }
  });
});

// ---------------------------------------------------------------------------
// Migration content guard
// ---------------------------------------------------------------------------
describe("H-15 cron lock — migration content", () => {
  const { sql } = readRepositoryMigration("20260941_cron_run_leases.sql");

  it("creates the cron_run_leases table idempotently", () => {
    expect(sql).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.cron_run_leases/i);
    expect(sql).toMatch(/job_name\s+text\s+primary\s+key/i);
    expect(sql).toMatch(/holder_id\s+uuid\s+not\s+null/i);
    expect(sql).toMatch(/expires_at\s+timestamptz\s+not\s+null/i);
  });

  it("defines try_acquire_cron_lock with atomic INSERT...ON CONFLICT WHERE expired-only takeover", () => {
    expect(sql).toMatch(/create\s+or\s+replace\s+function\s+public\.try_acquire_cron_lock/i);
    expect(sql).toMatch(/insert\s+into\s+public\.cron_run_leases/i);
    expect(sql).toMatch(/on\s+conflict\s*\(\s*job_name\s*\)\s+do\s+update/i);
    expect(sql).toMatch(/where\s+public\.cron_run_leases\.expires_at\s*<\s*v_now/i);
  });

  it("clamps lease seconds to [30, 3600] inside the RPC", () => {
    expect(sql).toMatch(/greatest\(\s*30\s*,\s*least\(\s*3600\s*,/i);
  });

  it("defines release_cron_lock with owner-checked DELETE", () => {
    expect(sql).toMatch(/create\s+or\s+replace\s+function\s+public\.release_cron_lock/i);
    expect(sql).toMatch(/delete\s+from\s+public\.cron_run_leases\s+where\s+job_name\s*=\s*p_job_name\s+and\s+holder_id\s*=\s*p_holder_id/i);
  });

  it("restricts EXECUTE on both RPCs to service_role only (no public/authenticated grants)", () => {
    expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+public\.try_acquire_cron_lock\([^)]*\)\s+from\s+public/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+public\.try_acquire_cron_lock\([^)]*\)\s+from\s+authenticated/i);
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.try_acquire_cron_lock\([^)]*\)\s+to\s+service_role/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+public\.release_cron_lock\([^)]*\)\s+from\s+public/i);
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.release_cron_lock\([^)]*\)\s+to\s+service_role/i);
  });

  it("enables RLS on cron_run_leases and removes anon/authenticated grants", () => {
    expect(sql).toMatch(/alter\s+table\s+public\.cron_run_leases\s+enable\s+row\s+level\s+security/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+public\.cron_run_leases\s+from\s+authenticated/i);
  });
});

// ---------------------------------------------------------------------------
// Per-route content guards: each financial / state-mutating cron route MUST
// import the lock helper and reference a CRON_LOCK_KEYS key.
// ---------------------------------------------------------------------------
describe("H-15 cron lock — per-route guards", () => {
  const webRoot = path.resolve(__dirname, "..", "..", "..");
  const cronRoot = path.join(webRoot, "app", "api", "cron");

  const protectedRoutes: Array<{ dir: string; key: keyof typeof CRON_LOCK_KEYS }> = [
    { dir: "generate-recurring-bookings", key: "generateRecurringBookings" },
    { dir: "charge-recurring-bookings", key: "chargeRecurringBookings" },
    { dir: "recurring-precharge-reminders", key: "recurringPrechargeReminders" },
    { dir: "charge-monthly-invoices", key: "monthlyInvoiceFinalize" },
    { dir: "finalize-monthly-invoices", key: "monthlyInvoiceFinalize" },
    { dir: "mark-monthly-invoices-overdue", key: "markMonthlyInvoicesOverdue" },
    { dir: "repair-monthly-payment-state-drift", key: "repairMonthlyPaymentStateDrift" },
    { dir: "send-invoice-reminders", key: "sendInvoiceReminders" },
    { dir: "expire-pending-payments", key: "expirePendingPayments" },
    { dir: "payment-link-reminders", key: "paymentLinkReminders" },
    { dir: "payment-recovery", key: "paymentRecovery" },
    { dir: "booking-lifecycle", key: "bookingLifecycle" },
    { dir: "assignment-ack-timeout", key: "assignmentAckTimeout" },
    { dir: "dispatch-timeouts", key: "dispatchTimeouts" },
    { dir: "dispatch-expiry", key: "dispatchTimeouts" },
    { dir: "retry-failed-jobs", key: "retryFailedJobs" },
    { dir: "generate-payouts", key: "generatePayouts" },
    { dir: "cleaner-earnings-auto-payout", key: "cleanerEarningsAutoPayout" },
    { dir: "create-payout-run", key: "createPayoutRun" },
    { dir: "freeze-payouts", key: "freezePayouts" },
    { dir: "payout-integrity-daily", key: "payoutIntegrityDaily" },
    { dir: "reconcile-paystack-transfers", key: "reconcilePaystackTransfers" },
    { dir: "process-payout-transfer-outbox", key: "processPayoutTransferOutbox" },
    { dir: "generate-recurring-expenses", key: "generateRecurringExpenses" },
    { dir: "finance-daily-automation", key: "financeDailyAutomation" },
    { dir: "backfill-paystack-payments", key: "backfillPaystackPayments" },
    { dir: "accounting-sync", key: "accountingSync" },
    { dir: "ops-health", key: "opsHealthMetrics" },
    { dir: "process-social-publish-jobs", key: "processSocialPublishJobs" },
  ];

  for (const route of protectedRoutes) {
    it(`${route.dir} imports the cron lock helper and references CRON_LOCK_KEYS.${String(route.key)}`, () => {
      const file = path.join(cronRoot, route.dir, "route.ts");
      const src = readFileSync(file, "utf8");

      // Must import either withCronLock or acquireCronLock from the cron lock module.
      const importsHelper =
        /from\s+["']@\/lib\/cron\/cronLock["']/.test(src) &&
        /(withCronLock|acquireCronLock|releaseCronLock)/.test(src);
      expect(importsHelper, `${route.dir} must import a cron-lock primitive`).toBe(true);

      // Must reference the matching key from the central registry.
      expect(src).toMatch(new RegExp(`CRON_LOCK_KEYS\\.${String(route.key)}\\b`));

      // Must short-circuit when skipped — every guarded route consults the
      // lock result before doing work and returns a non-error response.
      expect(src).toMatch(
        /(lockResult\.skipped|lockAcq\.ok|skipped\s*:\s*true|skipped\s*:\s*lockAcq\.reason)/,
      );
    });
  }

  it("non-financial cron routes are NOT auto-locked (avoid unnecessary serialization)", () => {
    const routesAlwaysOk = [
      "prune-admin-idempotency",
      "prune-system-logs",
      "notification-health",
      "analytics-warehouse",
      "ai-optimize",
      "seo-optimization",
      "customer-retention",
      "booking-reminders",
      "whatsapp-worker",
      "extend-cleaner-availability",
      "deferred-payment-link-emails",
      "subscription-bookings",
      "gsc-sync",
      "gsc-seo-fix-001-002-validate",
      "referral-campaigns",
      "referral-credit-reminders",
      "referral-credit-expiry",
      "promotions",
      "recover-stuck-publish",
    ];

    for (const r of routesAlwaysOk) {
      const file = path.join(cronRoot, r, "route.ts");
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/@\/lib\/cron\/cronLock/);
    }
  });

  it("CRON_LOCK_KEYS registry covers all unique protected keys (no orphans)", () => {
    const usedKeys = new Set(protectedRoutes.map((r) => r.key));
    for (const key of Object.keys(CRON_LOCK_KEYS) as Array<keyof typeof CRON_LOCK_KEYS>) {
      expect(usedKeys.has(key), `CRON_LOCK_KEYS.${String(key)} is registered but no route uses it`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Sanity: every cron route in the repo has been classified (locked or
// explicitly left unblocked). New cron routes must update one of the two lists
// in this test file.
// ---------------------------------------------------------------------------
describe("H-15 cron lock — coverage manifest", () => {
  const webRoot = path.resolve(__dirname, "..", "..", "..");
  const cronRoot = path.join(webRoot, "app", "api", "cron");

  const expectedLocked = new Set([
    "generate-recurring-bookings",
    "charge-recurring-bookings",
    "recurring-precharge-reminders",
    "charge-monthly-invoices",
    "finalize-monthly-invoices",
    "mark-monthly-invoices-overdue",
    "repair-monthly-payment-state-drift",
    "send-invoice-reminders",
    "expire-pending-payments",
    "payment-link-reminders",
    "payment-recovery",
    "booking-lifecycle",
    "assignment-ack-timeout",
    "dispatch-timeouts",
    "dispatch-expiry",
    "retry-failed-jobs",
    "generate-payouts",
    "cleaner-earnings-auto-payout",
    "create-payout-run",
    "freeze-payouts",
    "payout-integrity-daily",
    "reconcile-paystack-transfers",
    "process-payout-transfer-outbox",
    "generate-recurring-expenses",
    "finance-daily-automation",
    "backfill-paystack-payments",
    "accounting-sync",
    "ops-health",
    "process-social-publish-jobs",
  ]);

  const expectedUnblocked = new Set([
    "prune-admin-idempotency",
    "prune-system-logs",
    "notification-health",
    "analytics-warehouse",
    "ai-optimize",
    "seo-optimization",
    "customer-retention",
    "booking-reminders",
    "whatsapp-worker",
    "extend-cleaner-availability",
    "deferred-payment-link-emails",
    "subscription-bookings",
    "gsc-sync",
    "gsc-seo-fix-001-002-validate",
    "referral-campaigns",
    "referral-credit-reminders",
    "referral-credit-expiry",
    "promotions",
    "recover-stuck-publish",
  ]);

  it("all cron route directories are accounted for", () => {
    const all = readdirSync(cronRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const name of all) {
      expect(
        expectedLocked.has(name) || expectedUnblocked.has(name),
        `${name} is a cron route but is not classified in h15CronLockOverlapPrevention.test.ts; classify it as locked (financial/state-mutating) or unblocked (read-only/cleanup) and update both lists.`,
      ).toBe(true);
    }
  });
});
