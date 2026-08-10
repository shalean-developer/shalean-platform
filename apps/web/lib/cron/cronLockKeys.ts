/**
 * H-15: per-job cron lock keys.
 *
 * Each financial / payout / recurring / assignment / booking cron route claims a unique
 * lease on `cron_run_leases` keyed by one of these constants before doing any work.
 * Routes sharing the same engine (e.g. dispatch-timeouts + dispatch-expiry) intentionally
 * share a key so two different cron URLs hitting the same engine cannot double-run.
 *
 * Read-only / non-mutating cron routes intentionally do NOT appear here so they continue
 * to run in parallel without unnecessary serialization.
 *
 * Lease implementation: see `try_acquire_cron_lock` / `release_cron_lock` in
 * `supabase/migrations/20260941_cron_run_leases.sql`.
 */

export const CRON_LOCK_KEYS = {
  // Recurring & monthly billing pipeline
  generateRecurringBookings: "cron:generate-recurring-bookings",
  chargeRecurringBookings: "cron:charge-recurring-bookings",
  recurringPrechargeReminders: "cron:recurring-precharge-reminders",
  /** Shared by `/api/cron/charge-monthly-invoices` and `/api/cron/finalize-monthly-invoices` (same engine). */
  monthlyInvoiceFinalize: "cron:monthly-invoice-finalize",
  markMonthlyInvoicesOverdue: "cron:mark-monthly-invoices-overdue",
  repairMonthlyPaymentStateDrift: "cron:repair-monthly-payment-state-drift",
  sendInvoiceReminders: "cron:send-invoice-reminders",

  // Customer payment lifecycle
  expirePendingPayments: "cron:expire-pending-payments",
  paymentLinkReminders: "cron:payment-link-reminders",
  paymentRecovery: "cron:payment-recovery",

  // Booking / assignment / dispatch state
  bookingLifecycle: "cron:booking-lifecycle",
  assignmentAckTimeout: "cron:assignment-ack-timeout",
  /** Shared by `/api/cron/dispatch-timeouts` and `/api/cron/dispatch-expiry` (same engine). */
  dispatchTimeouts: "cron:dispatch-timeouts",
  retryFailedJobs: "cron:retry-failed-jobs",

  // Payouts & Paystack disbursements
  generatePayouts: "cron:generate-payouts",
  cleanerEarningsAutoPayout: "cron:cleaner-earnings-auto-payout",
  createPayoutRun: "cron:create-payout-run",
  freezePayouts: "cron:freeze-payouts",
  payoutIntegrityDaily: "cron:payout-integrity-daily",
  reconcilePaystackTransfers: "cron:reconcile-paystack-transfers",
  processPayoutTransferOutbox: "cron:process-payout-transfer-outbox",

  // Finance automation
  generateRecurringExpenses: "cron:generate-recurring-expenses",
  financeDailyAutomation: "cron:finance-daily-automation",
  backfillPaystackPayments: "cron:backfill-paystack-payments",
  accountingSync: "cron:accounting-sync",

  // Read-only observability
  opsHealthMetrics: "cron:ops-health-metrics",

  // Marketing — durable social publish queue (MKT-001B.2)
  processSocialPublishJobs: "cron:process-social-publish-jobs",

  // SEO competitor intelligence writes SERP snapshots and may incur provider cost.
  seoCompetitors: "cron:seo-competitors",
} as const;

export type CronLockKey = (typeof CRON_LOCK_KEYS)[keyof typeof CRON_LOCK_KEYS];
