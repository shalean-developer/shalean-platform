import "server-only";

import { reportOperationalIssue } from "@/lib/logging/systemLog";

import type { EmailSendErrorClassification } from "@/lib/email/classifyResendSendError";

/**
 * M-9: Per-cron-run circuit breaker for notification deliveries.
 *
 * Why this exists:
 *   The monthly-invoice email cron loops iterate over every eligible
 *   invoice and call `sendMonthlyInvoiceEmail` / `sendMonthlyInvoiceReminderEmail`
 *   for each one. Before this breaker, when `RESEND_API_KEY` was missing
 *   or invalid the loop would log a per-invoice operational issue 100s of
 *   times per cron tick — every day, indefinitely. Settlement state was
 *   already preserved (the invoice transitions `draft → sent` BEFORE the
 *   email send via `initializePaystackForMonthlyInvoice`), so the loop was
 *   effectively spamming the same actionable misconfiguration log over and
 *   over.
 *
 * What this does:
 *   The breaker is a tiny per-run state machine that callers consult
 *   BEFORE calling the SDK and update AFTER each send result. If a send
 *   classifies as `permanent_config`, the breaker:
 *     1. Escalates a SINGLE `reportOperationalIssue("error", ...)` for the
 *        run (subsequent permanent_config outcomes in the same run are
 *        deduped to a counter only).
 *     2. Returns `true` from `shouldSkipRemainingSends()` so callers can
 *        record a `skipped_permanent_config_failure` event for the
 *        remaining invoices without making any more network calls.
 *
 * What this does NOT do:
 *   - Persist state across cron runs. The next cron tick gets a fresh
 *     breaker so transient outages auto-recover and ops can fix the
 *     misconfiguration without any state cleanup.
 *   - Block settlement. Settlement (status flip, payment_link, Paystack
 *     init) happens before the send — the breaker only short-circuits
 *     the email side.
 *   - Touch billing or payout logic. Pure observability + retry policy.
 */

export type NotificationConfigBreakerScope = {
  /** Stable `system_logs.source` namespace, e.g. `"cron/finalize-monthly-invoices"`. */
  source: string;
  /** Notification channel for context, e.g. `"email"` or `"whatsapp"`. */
  channel: string;
};

export type NotificationConfigBreaker = {
  /** True iff a `permanent_config` outcome has been recorded in this run. */
  shouldSkipRemainingSends(): boolean;
  /** Stable token recorded in per-invoice events when the breaker has tripped. */
  skipReason(): string | null;
  /** Snapshot for cron-run summary logging. */
  snapshot(): NotificationConfigBreakerSnapshot;
  /**
   * Update the breaker after a send attempt.
   *
   * Triggers a single `reportOperationalIssue` on the FIRST permanent_config
   * outcome of the run. Subsequent permanent_config outcomes are deduped
   * (the counter is incremented but no new report is emitted) so a 500-
   * invoice run never produces 500 ops issues for the same misconfiguration.
   */
  recordSendOutcome(input: {
    classification: EmailSendErrorClassification;
    errorMessage?: string | null;
    invoiceId?: string | null;
  }): Promise<void>;
  /**
   * Bookkeeping for invoices we never attempted because the breaker had
   * already tripped earlier in the same run. Does not emit a log.
   */
  recordSkippedInvoice(invoiceId?: string | null): void;
};

export type NotificationConfigBreakerSnapshot = Readonly<{
  source: string;
  channel: string;
  trippedAtIso: string | null;
  trippedReason: string | null;
  permanentConfigOutcomes: number;
  skippedInvoiceCount: number;
  attemptedAfterTripCount: number;
}>;

/**
 * Stable token written to per-invoice failure events when the breaker has
 * tripped. Picked deliberately to be greppable in `monthly_invoice_events`
 * and `system_logs.context.error_message`.
 */
export const NOTIFICATION_CONFIG_BREAKER_SKIP_REASON = "permanent_config_failure_breaker_open" as const;

/**
 * Construct a fresh breaker for one cron run. Callers should NOT cache
 * across runs — keeping breakers ephemeral is what gives us the daily
 * "fix-it-and-retry-tomorrow" semantics without any persisted state.
 */
export function createNotificationConfigBreaker(scope: NotificationConfigBreakerScope): NotificationConfigBreaker {
  let trippedAtIso: string | null = null;
  let trippedReason: string | null = null;
  let permanentConfigOutcomes = 0;
  let skippedInvoiceCount = 0;
  let attemptedAfterTripCount = 0;
  let escalated = false;

  return {
    shouldSkipRemainingSends() {
      return trippedAtIso != null;
    },
    skipReason() {
      return trippedAtIso ? NOTIFICATION_CONFIG_BREAKER_SKIP_REASON : null;
    },
    snapshot() {
      return Object.freeze({
        source: scope.source,
        channel: scope.channel,
        trippedAtIso,
        trippedReason,
        permanentConfigOutcomes,
        skippedInvoiceCount,
        attemptedAfterTripCount,
      });
    },
    async recordSendOutcome(input) {
      if (input.classification !== "permanent_config") return;
      permanentConfigOutcomes += 1;
      if (trippedAtIso != null) {
        attemptedAfterTripCount += 1;
        return;
      }
      trippedAtIso = new Date().toISOString();
      trippedReason = (input.errorMessage ?? "").trim() || NOTIFICATION_CONFIG_BREAKER_SKIP_REASON;
      if (escalated) return;
      escalated = true;
      await reportOperationalIssue(
        "error",
        scope.source,
        "notification_config_breaker_tripped",
        {
          channel: scope.channel,
          reason: trippedReason,
          first_invoice_id: input.invoiceId ?? null,
          remediation:
            "RESEND_API_KEY / RESEND_FROM are missing or invalid; remaining " +
            scope.channel +
            " sends in this cron run are skipped to avoid retry churn. Settlement state is preserved.",
        },
      );
    },
    recordSkippedInvoice(invoiceId) {
      if (trippedAtIso == null) return;
      skippedInvoiceCount += 1;
      void invoiceId;
    },
  };
}
