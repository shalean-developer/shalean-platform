import { formatZarFromCents } from "@/lib/cleaner/cleanerZarFormat";
import { resolveCleanerEarningsCents } from "@/lib/cleaner/resolveCleanerEarnings";

/**
 * Cleaner-facing pay copy for an offer / assigned job. The amount is the
 * actual configured cleaner share for this specific booking — not an
 * estimate, not "potential payout". When the source of truth is missing
 * (no persisted earnings, preview fallback failed) we render
 * "Job earning unavailable" and log a data-integrity warning so the gap
 * is visible in observability — we never silently substitute R0.
 *
 * Source of truth precedence (`resolveCleanerEarningsCents`):
 *   1. `cleaner_earnings_total_cents` (line-item finalized, set at completion)
 *   2. `payout_frozen_cents`          (settlement-frozen, set at invoice eligibility)
 *   3. `display_earnings_cents`       (first persist via persistCleanerPayoutIfUnset)
 * Fallback (server only): `previewDisplayEarningsCentsForCleanerJob` runs
 * the same `computeBookingEarnings` engine in-memory without persisting.
 */
export const JOB_EARNING_LABEL = "Job earning" as const;
export const JOB_EARNING_UNAVAILABLE_LABEL = "Job earning unavailable" as const;
/**
 * Stronger copy for surfaces that block a workflow when the earning is missing
 * or zero (job detail Complete gate, completion API rejection). Routes the
 * cleaner to support so an admin can run the repair (`/api/admin/bookings/[id]/reset-earnings?force=true`
 * or the bulk script) before the job is allowed to complete.
 */
export const JOB_EARNING_UNAVAILABLE_CONTACT_LABEL = "Job earning unavailable — contact support" as const;
/** Sub-copy paired with a disabled Complete button when {@link isCleanerJobEarningPositive} is false. */
export const JOB_EARNING_BLOCK_COMPLETION_MESSAGE =
  "Cannot complete job until job earning is confirmed." as const;
/** Stable error `code` returned by the cleaner-complete API when display_earnings_cents <= 0. */
export const JOB_EARNING_UNAVAILABLE_ERROR_CODE = "job_earning_unavailable" as const;
export const JOB_EARNING_CURRENCY = "ZAR" as const;

export type CleanerJobEarning = {
  /** Cents in {@link JOB_EARNING_CURRENCY}. `null` means "source of truth unavailable" — render {@link JOB_EARNING_UNAVAILABLE_LABEL}. */
  amount_cents: number | null;
  currency: typeof JOB_EARNING_CURRENCY;
  label: typeof JOB_EARNING_LABEL;
};

/**
 * Wrap a raw cents value (or null) into the canonical {@link CleanerJobEarning}
 * shape. Negative / non-finite inputs are clamped to 0. Use this when the
 * caller has already resolved the earning value upstream (e.g. via the
 * preview helper).
 */
export function cleanerJobEarningFromCents(amountCents: number | null | undefined): CleanerJobEarning {
  if (amountCents === null || amountCents === undefined) {
    return { amount_cents: null, currency: JOB_EARNING_CURRENCY, label: JOB_EARNING_LABEL };
  }
  const n = Number(amountCents);
  if (!Number.isFinite(n)) {
    return { amount_cents: null, currency: JOB_EARNING_CURRENCY, label: JOB_EARNING_LABEL };
  }
  return { amount_cents: Math.max(0, Math.round(n)), currency: JOB_EARNING_CURRENCY, label: JOB_EARNING_LABEL };
}

/**
 * Resolve the canonical cleaner earning for a booking row using the
 * existing {@link resolveCleanerEarningsCents} precedence. Returns the
 * "unavailable" shape when all three booking earning fields are null.
 */
export function resolveCleanerJobEarning(row: {
  cleaner_earnings_total_cents?: unknown;
  payout_frozen_cents?: unknown;
  display_earnings_cents?: unknown;
}): CleanerJobEarning {
  return cleanerJobEarningFromCents(resolveCleanerEarningsCents(row));
}

/**
 * Returns the human-facing display string for an earning. Always uses the
 * "Job earning" label per product spec — never "Estimated payout" or
 * "Potential earnings". When unavailable, returns {@link JOB_EARNING_UNAVAILABLE_LABEL}.
 */
export function formatCleanerJobEarningDisplay(earning: CleanerJobEarning): string {
  if (earning.amount_cents == null) return JOB_EARNING_UNAVAILABLE_LABEL;
  return `${earning.label}: ${formatZarFromCents(earning.amount_cents)}`;
}

/** True when the earning has a resolved amount (including R0). */
export function isCleanerJobEarningAvailable(earning: CleanerJobEarning | null | undefined): boolean {
  return earning != null && earning.amount_cents != null;
}

/**
 * True only when the earning is **strictly positive** (R > 0). This is the gate
 * the cleaner UI uses to decide whether to show the amount vs.
 * {@link JOB_EARNING_UNAVAILABLE_CONTACT_LABEL}, and what the completion API
 * checks before letting `in_progress → completed` proceed.
 *
 * R0 is treated as "unavailable" because in this product every legitimate
 * cleaner share is positive — R0 only happens when the booking has no payment
 * basis yet (e.g. unpaid recurring/monthly invoice) or when backfill line items
 * landed without a price. Allowing R0 through means the cleaner records a
 * completed job with no payout, which is the exact failure we are fixing.
 */
export function isCleanerJobEarningPositive(earning: CleanerJobEarning | null | undefined): boolean {
  if (!earning) return false;
  const cents = earning.amount_cents;
  return typeof cents === "number" && Number.isFinite(cents) && cents > 0;
}

/**
 * Display string for surfaces that block a workflow on missing/zero earnings.
 * Returns "Job earning: R___" when positive, otherwise
 * {@link JOB_EARNING_UNAVAILABLE_CONTACT_LABEL}.
 */
export function formatCleanerJobEarningStrictDisplay(earning: CleanerJobEarning | null | undefined): string {
  if (!isCleanerJobEarningPositive(earning)) return JOB_EARNING_UNAVAILABLE_CONTACT_LABEL;
  return `${earning!.label}: ${formatZarFromCents(earning!.amount_cents ?? 0)}`;
}
