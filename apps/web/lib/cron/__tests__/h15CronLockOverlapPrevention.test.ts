import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readRepositoryMigration } from "@/lib/audit/resolveRepositoryMigration";
import { acquireCronLock, releaseCronLock, withCronLock } from "../cronLock";
import { CRON_LOCK_KEYS } from "../cronLockKeys";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
        const current = store.get(jobName);
        if (current && current.expiresAtMs > now && current.holderId !== holderId) {
          return Promise.resolve({ data: false, error: null });
        }
        store.set(jobName, { holderId, expiresAtMs: now + leaseSeconds * 1000 });
        return Promise.resolve({ data: true, error: null });
      }
      if (name === "release_cron_lock") {
        const jobName = String(args.p_job_name ?? "");
        const holderId = String(args.p_holder_id ?? "");
        const current = store.get(jobName);
        if (current?.holderId === holderId) {
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
  let mock: ReturnType<typeof makeLockMock>;

  beforeEach(() => {
    mock = makeLockMock();
  });

  afterEach(() => vi.restoreAllMocks());

  it("rejects a concurrent holder and allows acquisition after release", async () => {
    const first = await acquireCronLock(mock.admin as never, { jobName: "test:job", leaseSeconds: 60 });
    expect(first.ok).toBe(true);
    const second = await acquireCronLock(mock.admin as never, { jobName: "test:job", leaseSeconds: 60 });
    expect(second.ok).toBe(false);
    if (!first.ok) throw new Error("unreachable");
    await releaseCronLock(mock.admin as never, first.jobName, first.holderId);
    expect((await acquireCronLock(mock.admin as never, { jobName: "test:job" })).ok).toBe(true);
  });

  it("releases the lease when wrapped work throws", async () => {
    await expect(withCronLock(mock.admin as never, { jobName: "test:throws" }, async () => {
      throw new Error("boom");
    })).rejects.toThrow("boom");
    expect(mock.store.has("test:throws")).toBe(false);
  });

  it("fails open when the acquire RPC has a transient error", async () => {
    mock.failNextAcquire.value = { error: { message: "transient db error" } };
    const fn = vi.fn(async () => "ran");
    const result = await withCronLock(mock.admin as never, { jobName: "test:degraded" }, fn);
    expect(result.skipped).toBe(false);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("clamps lease seconds before invoking the RPC", async () => {
    await acquireCronLock(mock.admin as never, { jobName: "test:max", leaseSeconds: 7200 });
    expect(mock.calls.filter((call) => call.rpc === "try_acquire_cron_lock").at(-1)?.args.p_lease_seconds).toBe(3600);
    await acquireCronLock(mock.admin as never, { jobName: "test:min", leaseSeconds: 5 });
    expect(mock.calls.filter((call) => call.rpc === "try_acquire_cron_lock").at(-1)?.args.p_lease_seconds).toBe(30);
  });
});

describe("H-15 cron lock — migration content", () => {
  const { sql } = readRepositoryMigration("20260941_cron_run_leases.sql");

  it("creates and protects the lease table and RPCs", () => {
    expect(sql).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.cron_run_leases/i);
    expect(sql).toMatch(/create\s+or\s+replace\s+function\s+public\.try_acquire_cron_lock/i);
    expect(sql).toMatch(/on\s+conflict\s*\(\s*job_name\s*\)\s+do\s+update/i);
    expect(sql).toMatch(/where\s+public\.cron_run_leases\.expires_at\s*<\s*v_now/i);
    expect(sql).toMatch(/create\s+or\s+replace\s+function\s+public\.release_cron_lock/i);
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.try_acquire_cron_lock\([^)]*\)\s+to\s+service_role/i);
    expect(sql).toMatch(/alter\s+table\s+public\.cron_run_leases\s+enable\s+row\s+level\s+security/i);
  });
});

describe("H-15 cron lock — route governance", () => {
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
    { dir: "payout-funding-gap-alert", key: "payoutFundingGapAlert" },
    { dir: "reconcile-paystack-transfers", key: "reconcilePaystackTransfers" },
    { dir: "reconcile-paystack-settlements", key: "reconcilePaystackSettlements" },
    { dir: "process-payout-transfer-outbox", key: "processPayoutTransferOutbox" },
    { dir: "generate-recurring-expenses", key: "generateRecurringExpenses" },
    { dir: "finance-daily-automation", key: "financeDailyAutomation" },
    { dir: "backfill-paystack-payments", key: "backfillPaystackPayments" },
    { dir: "accounting-sync", key: "accountingSync" },
    { dir: "ops-health", key: "opsHealthMetrics" },
    { dir: "process-social-publish-jobs", key: "processSocialPublishJobs" },
    { dir: "seo-competitors", key: "seoCompetitors" },
    { dir: "seo-indexing", key: "seoIndexing" },
  ];

  const unblockedRoutes = [
    "prune-admin-idempotency", "prune-system-logs", "notification-health", "analytics-warehouse",
    "ai-optimize", "seo-optimization", "customer-retention", "booking-reminders", "whatsapp-worker",
    "extend-cleaner-availability", "deferred-payment-link-emails", "subscription-bookings", "gsc-sync",
    "gsc-seo-fix-001-002-validate", "referral-campaigns", "referral-credit-reminders",
    "referral-credit-expiry", "promotions", "recover-stuck-publish", "retry-failed-emails",
    // Sitemap health is a read-only idempotent probe, so overlapping invocations are safe without a global lease.
    "sitemap-health",
    // Review prompt rows are claimed with conditional timestamp updates in the worker,
    // so overlapping invocations are intentionally CAS-safe without a global lease.
    "review-prompts",
  ];

  for (const route of protectedRoutes) {
    it(`${route.dir} uses its registered cron lock`, () => {
      const src = readFileSync(path.join(cronRoot, route.dir, "route.ts"), "utf8");
      expect(src).toMatch(/from\s+["']@\/lib\/cron\/cronLock["']/);
      expect(src).toMatch(new RegExp(`CRON_LOCK_KEYS\\.${String(route.key)}\\b`));
      expect(src).toMatch(/(lockResult\.skipped|lockAcq\.ok|skipped\s*:\s*true|skipped\s*:\s*lockAcq\.reason)/);
    });
  }

  it("explicitly unblocked routes do not import the global cron lock", () => {
    for (const route of unblockedRoutes) {
      const src = readFileSync(path.join(cronRoot, route, "route.ts"), "utf8");
      expect(src).not.toMatch(/@\/lib\/cron\/cronLock/);
    }
  });

  it("all registered keys are used and every cron directory is classified", () => {
    const usedKeys = new Set(protectedRoutes.map((route) => route.key));
    for (const key of Object.keys(CRON_LOCK_KEYS) as Array<keyof typeof CRON_LOCK_KEYS>) {
      expect(usedKeys.has(key), `CRON_LOCK_KEYS.${String(key)} is registered but unused`).toBe(true);
    }

    const locked = new Set(protectedRoutes.map((route) => route.dir));
    const unblocked = new Set(unblockedRoutes);
    const allRoutes = readdirSync(cronRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    for (const route of allRoutes) {
      expect(locked.has(route) || unblocked.has(route), `${route} is not classified`).toBe(true);
    }
  });
});
