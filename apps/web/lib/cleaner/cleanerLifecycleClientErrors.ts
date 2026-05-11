/**
 * Cleaner-facing copy for lifecycle POST failures (job detail, etc.).
 * Prefer stable `code` from API when present.
 */
export function cleanerLifecycleFailureMessage(params: {
  action: string;
  code?: string | null;
  baseMessage: string;
  httpStatus: number;
}): string {
  const code = String(params.code ?? "").trim();
  const base = params.baseMessage.trim() || "Something went wrong.";

  if (code === "payout_verify_failed") {
    return "Pay for this job could not be verified yet, so we can't mark it complete. Please try again later or contact support if this continues.";
  }
  if (code === "payout_persist_failed") {
    return "We couldn't record earnings for this job, so completion was blocked. Please try again; contact support if it keeps failing.";
  }
  if (code === "payout_exceeds_financial_cap") {
    return "Recorded pay for this job is outside allowed limits for its billing type. Contact support — this is usually a data setup issue.";
  }
  if (code === "job_earning_unavailable") {
    return "Job earning is R0,00 for this booking — please contact support to confirm the amount before completing.";
  }
  if (code === "lifecycle_complete_requires_in_progress") {
    return "Start the job in the app before marking it complete.";
  }
  if (code === "lifecycle_recurring_pending_payment_progression_blocked") {
    return "This recurring visit is still awaiting payment or invoice approval. You can accept or decline it, but travel, start, and complete stay locked until that confirms.";
  }
  if (code === "lifecycle_pending_payment_blocked") {
    return "This booking is still awaiting payment. Actions unlock after payment is confirmed.";
  }
  if (params.httpStatus === 503) {
    return "The server is temporarily unavailable. Please try again in a moment.";
  }
  if (params.httpStatus === 401) {
    return "Sign in again, then retry.";
  }
  if (code) {
    return `${base} (ref: ${code})`;
  }
  return base;
}
