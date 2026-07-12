import { canonicalDbBookingStatus } from "@shalean/types";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * Resolve cleaner UUID for review eligibility (mirrors web
 * resolveReviewCleanerIdForSubmission — display/CTA only; server re-checks).
 */
export function resolveReviewCleanerId(row: {
  cleaner_id?: string | null;
  payout_owner_cleaner_id?: string | null;
  is_team_job?: boolean | null;
}): string | null {
  const cleanerRaw = String(row.cleaner_id ?? "").trim();
  if (UUID_RE.test(cleanerRaw)) return cleanerRaw.toLowerCase();
  if (row.is_team_job === true) {
    const ownerRaw = String(row.payout_owner_cleaner_id ?? "").trim();
    if (UUID_RE.test(ownerRaw)) return ownerRaw.toLowerCase();
  }
  return null;
}

/** Completed booking the customer can still rate (not already reviewed). */
export function isBookingPendingCustomerReview(
  row: {
    id: string;
    status?: string | null;
    completed_at?: string | null;
    cleaner_id?: string | null;
    payout_owner_cleaner_id?: string | null;
    is_team_job?: boolean | null;
  },
  reviewedBookingIds: ReadonlySet<string>,
): boolean {
  if (reviewedBookingIds.has(row.id)) return false;
  const status = canonicalDbBookingStatus(row.status);
  const completed =
    status === "completed" || Boolean(String(row.completed_at ?? "").trim());
  if (!completed) return false;
  if (status === "cancelled" || status === "failed" || status === "payment_expired") {
    return false;
  }
  return resolveReviewCleanerId(row) != null;
}
