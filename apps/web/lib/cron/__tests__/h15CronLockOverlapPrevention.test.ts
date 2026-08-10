import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { acquireCronLock, releaseCronLock, runWithCronLock } from "@/lib/cron/cronLock";
import { CRON_LOCK_KEYS } from "@/lib/cron/lockKeys";

const here = path.dirname(fileURLToPath(import.meta.url));
const cronRoot = path.resolve(here, "../../../app/api/cron");

describe("H-15 cron lock — behavioural", () => {
  it("rejects a concurrent holder and allows acquisition after release", async () => {
    const state = new Map<string, string>();
    const supabase = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        const key = String(args.p_lock_key);
        const holder = String(args.p_holder_id);
        if (fn === "acquire_cron_lock") {
          if (state.has(key)) return { data: false, error: null };
          state.set(key, holder);
          return { data: true, error: null };
        }
        if (fn === "release_cron_lock") {
          if (state.get(key) === holder) state.delete(key);
          return { data: true, error: null };
        }
        throw new Error(`unexpected rpc ${fn}`);
      },
    } as never;

    const first = await acquireCronLock(supabase, "test:lock", 120);
    expect(first.ok).toBe(true);
    const second = await acquireCronLock(supabase, "test:lock", 120);
    expect(second.ok).toBe(false);
    if (first.ok) await releaseCronLock(supabase, "test:lock", first.holderId);
    const third = await acquireCronLock(supabase, "test:lock", 120);
    expect(third.ok).toBe(true);
  });

  it("releases the lease when wrapped work throws", async () => {
    let released = false;
    const supabase = {
      rpc: async (fn: string) => {
        if (fn === "acquire_cron_lock") return { data: true, error: null };
        if (fn === "release_cron_lock") {
          released = true;
          return { data: true, error: null };
        }
        return { data: null, error: null };
      },
    } as never;

    await expect(runWithCronLock(supabase, "test:throws", 60, async () => {
      throw new Error("boom");
    })).rejects.toThrow("boom");
    expect(released).toBe(true);
  });

  it("fails open when the acquire RPC has a transient error", async () => {
    const supabase = {
      rpc: async () => ({ data: null, error: { message: "transient db error" } }),
    } as never;
    const result = await acquireCronLock(supabase, "test:degraded", 60);
    expect(result.ok).toBe(true);
  });

  it("clamps lease seconds before invoking the RPC", async () => {
    let lease: unknown;
    const supabase = {
      rpc: async (_fn: string, args: Record<string, unknown>) => {
        lease = args.p_lease_seconds;
        return { data: true, error: null };
      },
    } as never;
    await acquireCronLock(supabase, "test:clamp", 1);
    expect(lease).toBeGreaterThanOrEqual(30);
  });
});

describe("H-15 cron lock — migration content", () => {
  it("creates and protects the lease table and RPCs", () => {
    const migration = readFileSync(path.resolve(here, "../../../../supabase/migrations/20260714123000_h15_cron_lock_overlap_prevention.sql"), "utf8");
    expect(migration).toMatch(/create table if not exists public\.cron_job_locks/i);
    expect(migration).toMatch(/create or replace function public\.acquire_cron_lock/i);
    expect(migration).toMatch(/create or replace function public\.release_cron_lock/i);
    expect(migration).toMatch(/revoke all on function public\.acquire_cron_lock/i);
    expect(migration).toMatch(/grant execute on function public\.acquire_cron_lock/i);
  });
});

describe("H-15 cron lock — route governance", () => {
  const protectedRoutes = [
    { dir: "generate-recurring-bookings", key: "generateRecurringBookings" },
    { dir: "charge-recurring-bookings", key: "chargeRecurringBookings" },
    { dir: "recurring-precharge-reminders", key: "recurringPrechargeReminders" },
    { dir: "charge-monthly-invoices", key: "chargeMonthlyInvoices" },
    { dir: "finalize-monthly-invoices", key: "finalizeMonthlyInvoices" },
    { dir: "mark-monthly-invoices-overdue", key: "markMonthlyInvoicesOverdue" },
    { dir: "repair-monthly-payment-state-drift", key: "repairMonthlyPaymentStateDrift" },
    { dir: "send-invoice-reminders", key: "sendInvoiceReminders" },
    { dir: "expire-pending-payments", key: "expirePendingPayments" },
    { dir: "payment-link-reminders", key: "paymentLinkReminders" },
    { dir: "payment-recovery", key: "paymentRecovery" },
    { dir: "booking-lifecycle", key: "bookingLifecycle" },
    { dir: "assignment-ack-timeout", key: "assignmentAckTimeout" },
    { dir: "dispatch-timeouts", key: "dispatchTimeouts" },
    { dir: "dispatch-expiry", key: "dispatchExpiry" },
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

  const unblockedRoutes = [
    "prune-admin-idempotency", "prune-system-logs", "notification-health", "analytics-warehouse",
    "ai-optimize", "seo-optimization", "customer-retention", "booking-reminders", "whatsapp-worker",
    "extend-cleaner-availability", "deferred-payment-link-emails", "subscription-bookings", "gsc-sync",
    "gsc-seo-fix-001-002-validate", "referral-campaigns", "referral-credit-reminders",
    "referral-credit-expiry", "promotions", "recover-stuck-publish", "retry-failed-emails",
    // Sitemap monitoring is a read-only, idempotent health probe and is safe without a global lease.
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
