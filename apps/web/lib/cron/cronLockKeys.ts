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
  generateRecurringBookings: "cron:generate-recurring-bookings",
  chargeRecurringBookings: "cron:charge-recurring-bookings",
  recurringPrechargeReminders: "cron:recurring-precharge-reminders",
  monthlyInvoiceFinalize: "cron:monthly-invoice-finalize",
  markMonthlyInvoicesOverdue: "cron:mark-monthly-invoices-overdue",
  repairMonthlyPaymentStateDrift: "cron:repair-monthly-payment-state-drift",
  sendInvoiceReminders: "cron:send-invoice-reminders",
  expirePendingPayments: "cron:expire-pending-payments",
  paymentLinkReminders: "cron:payment-link-reminders",
  paymentRecovery: "cron:payment-recovery",
  bookingLifecycle: "cron:booking-lifecycle",
  assignmentAckTimeout: "cron:assignment-ack-timeout",
  dispatchTimeouts: "cron:dispatch-timeouts",
  retryFailedJobs: "cron:retry-failed-jobs",
  generatePayouts: "cron:generate-payouts",
  cleanerEarningsAutoPayout: "cron:cleaner-earnings-auto-payout",
  createPayoutRun: "cron:create-payout-run",
  freezePayouts: "cron:freeze-payouts",
  payoutIntegrityDaily: "cron:payout-integrity-daily",
  payoutFundingGapAlert: "cron:payout-funding-gap-alert",
  reconcilePaystackTransfers: "cron:reconcile-paystack-transfers",
  reconcilePaystackSettlements: "cron:reconcile-paystack-settlements",
  processPayoutTransferOutbox: "cron:process-payout-transfer-outbox",
  generateRecurringExpenses: "cron:generate-recurring-expenses",
  financeDailyAutomation: "cron:finance-daily-automation",
  backfillPaystackPayments: "cron:backfill-paystack-payments",
  accountingSync: "cron:accounting-sync",
  opsHealthMetrics: "cron:ops-health-metrics",
  processSocialPublishJobs: "cron:process-social-publish-jobs",
  seoCompetitors: "cron:seo-competitors",
  seoIndexing: "cron:seo-indexing",
} as const;

export type CronLockKey = (typeof CRON_LOCK_KEYS)[keyof typeof CRON_LOCK_KEYS];
