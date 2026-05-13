/**
 * M-9: Classify a notification-send failure into a retry policy class.
 *
 * Background:
 *   The monthly-invoice email cron loops (`finalizeDueMonthlyInvoices`,
 *   `runSendInvoiceReminders`) used to treat every `sent: false` outcome the
 *   same — they would log a per-invoice operational issue and continue. When
 *   `RESEND_API_KEY` was missing or invalid (or the configured `from` address
 *   was rejected), this produced N ops-issue logs per cron run with no
 *   per-run rate limiting, even though the underlying configuration error
 *   would never resolve until ops intervened. The same loop would also
 *   ignore the obvious "give up" signal on transient errors that DID
 *   warrant a retry on the next cron tick.
 *
 * This module is the **single source of truth** for that classification. It
 * is pure (no I/O, no env reads) and consumes the well-typed Resend
 * `ErrorResponse` shape (`{ name: RESEND_ERROR_CODE_KEY, statusCode: number
 * | null, message: string }`) plus a few synthetic shapes the helpers in
 * `sendMonthlyInvoiceEmail` use when the SDK never gets called (e.g.
 * `RESEND_API_KEY not set`).
 *
 * Returns one of:
 *   - `"transient"`            → safe to retry on next cron tick (rate
 *                                limit, 5xx, network error, unknown).
 *   - `"permanent_config"`     → the deployment is misconfigured (missing
 *                                / invalid / restricted API key, unverified
 *                                from-address). The cron loop SHOULD stop
 *                                attempting further sends in this run and
 *                                the breaker (`notificationConfigBreaker`)
 *                                should escalate ONCE per run.
 *   - `"permanent_validation"` → the request itself is invalid for THIS
 *                                recipient (bad email format, missing
 *                                required field). Other invoices in the
 *                                same run are unaffected — record the per-
 *                                invoice failure and continue.
 *
 * Important constraints (M-9):
 *   - Do not block settlement on email delivery — callers always treat
 *     classification as advisory; the underlying invoice/booking writes
 *     are decoupled and complete before the send.
 *   - Do not change billing formulas — this module is observability /
 *     retry policy only.
 */

export type EmailSendErrorClassification =
  | "transient"
  | "permanent_config"
  | "permanent_validation";

/** Loose shape that matches `ErrorResponse` from `resend@^6` without forcing the SDK type. */
export type ResendLikeError = {
  /** Resend's `RESEND_ERROR_CODE_KEY` (subset enumerated in the `name` switch below). */
  name?: string | null;
  /** HTTP status from Resend's REST response, or `null` when the SDK couldn't parse one. */
  statusCode?: number | null;
  /** Human-readable text used for the cron audit trail; never parsed. */
  message?: string | null;
};

/**
 * Resend `name` codes that correspond to **deployment misconfiguration**.
 * These will never self-heal between cron ticks without operator action.
 */
const PERMANENT_CONFIG_NAMES = new Set<string>([
  "missing_api_key",
  "invalid_api_key",
  "restricted_api_key",
  "invalid_from_address",
  "invalid_access",
  "invalid_region",
  "security_error",
]);

/**
 * Resend `name` codes that correspond to **per-request input** problems.
 * Other invoices in the same run can still succeed; only this recipient
 * needs human review.
 */
const PERMANENT_VALIDATION_NAMES = new Set<string>([
  "validation_error",
  "missing_required_field",
  "invalid_attachment",
  "invalid_parameter",
  "invalid_idempotency_key",
  "invalid_idempotent_request",
  "concurrent_idempotent_requests",
  "method_not_allowed",
  "not_found",
]);

/**
 * Resend `name` codes that are intrinsically transient — provider-side
 * rate limiting or capacity issues that resolve themselves with time.
 */
const TRANSIENT_NAMES = new Set<string>([
  "rate_limit_exceeded",
  "monthly_quota_exceeded",
  "daily_quota_exceeded",
  "internal_server_error",
  "application_error",
]);

/**
 * Internal sentinels emitted by `sendMonthlyInvoiceEmail` when it short-
 * circuits before calling the Resend SDK (so the existing `string` `error`
 * field on the public return shape stays stable for callers / tests).
 */
const PERMANENT_CONFIG_SENTINEL_MESSAGES = [
  "RESEND_API_KEY not set",
  "RESEND_API_KEY missing",
  "RESEND_FROM invalid",
];

/**
 * Pure classifier — see module docstring for the full retry-policy contract.
 *
 * Resilient to upstream shape drift: an unknown `name` falls back to the
 * HTTP status (4xx → permanent_validation, 5xx → transient, 429 → transient,
 * 401/403 → permanent_config). An entirely unrecognised payload classifies
 * as `"transient"` so the cron loop keeps trying — we only escalate to a
 * "stop the run" signal on positively-identified config failures.
 */
export function classifyResendSendError(error: ResendLikeError | null | undefined): EmailSendErrorClassification {
  if (!error) return "transient";

  const name = String(error.name ?? "").trim().toLowerCase();
  const status = typeof error.statusCode === "number" && Number.isFinite(error.statusCode)
    ? error.statusCode
    : null;
  const messageRaw = String(error.message ?? "").trim();

  if (PERMANENT_CONFIG_SENTINEL_MESSAGES.some((m) => messageRaw === m)) {
    return "permanent_config";
  }

  if (name && PERMANENT_CONFIG_NAMES.has(name)) return "permanent_config";
  if (name && PERMANENT_VALIDATION_NAMES.has(name)) return "permanent_validation";
  if (name && TRANSIENT_NAMES.has(name)) return "transient";

  if (status != null) {
    if (status === 401 || status === 403) return "permanent_config";
    if (status === 429) return "transient";
    if (status >= 500 && status < 600) return "transient";
    if (status >= 400 && status < 500) return "permanent_validation";
  }

  return "transient";
}

/**
 * Convenience predicate for callers that just want to know whether they
 * should keep trying remaining work in the same cron run. Mirrors the
 * breaker contract in `notificationConfigBreaker.ts`.
 */
export function isPermanentConfigFailure(c: EmailSendErrorClassification): boolean {
  return c === "permanent_config";
}
