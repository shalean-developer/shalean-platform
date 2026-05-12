/**
 * ## Customer review / post-completion follow-up — eligibility contract (read-only)
 *
 * ### Trigger map (today)
 *
 * | Mechanism | When it runs | Completion gate before this slice | After this slice |
 * |-----------|----------------|-----------------------------------|------------------|
 * | `booking_lifecycle_jobs` **`review_request`** | Cron: `scheduled_for <= now` (inserted at payment; schedule = **4h after appointment start** in {@link computeLifecycleScheduledIso}) | **`status` only** in `processLifecycleJob` (cancelled skipped) | **`isAuthoritativeBookingCompleted`** + assignee + terminal exclusions |
 * | **`notifyBookingEvent(completed)`** | Cleaner/admin/cron completion paths | Dedupe `completed_sent`; SMS queue if `cleaner_id` + phone | Uses same {@link evaluateCustomerReviewPromptEligibility} helpers where row is loaded |
 * | **`review_sms_prompt_queue`** worker | Cron `processReviewSmsPromptQueue` | `status === "completed"` only | **Authoritative completion** + assignee rule |
 * | **Dashboard CTA** (`/dashboard/bookings`) | Client | {@link isDashboardBookingAuthoritativelyCompleted} (already aligned) | Unchanged |
 * | **`POST /api/bookings/review`** | Customer submits | `status === "completed"` only | **`completed_at` OR `status=completed`** via {@link evaluateCustomerReviewSubmissionEligibility} |
 *
 * Idempotency: lifecycle rows use unique insert + send guard; SMS queue `upsert(booking_id)`; notification dedupe `completed_sent`; review insert unique `(booking_id)` → **23505**.
 *
 * ### Minimal contract
 *
 * - Prompts and submissions use **shared completed truth**: {@link isAuthoritativeBookingCompleted}.
 * - Terminal / unpaid-checkout bookings **never** receive review prompts from this layer.
 * - Review prompts require an assignee: **`cleaner_id`** OR **team job with `team_id`**.
 * - Submission requires a cleaner UUID for `reviews.cleaner_id` (NOT NULL in DB).
 *   Resolution order (see {@link resolveReviewCleanerIdForSubmission}):
 *     1. `bookings.cleaner_id` when set (single-cleaner job — unchanged behaviour).
 *     2. `bookings.payout_owner_cleaner_id` when `is_team_job=true` and a UUID
 *        is set (Production Readiness Audit H-8: team-assigned bookings clear
 *        `cleaner_id` and carry the lead cleaner in `payout_owner_cleaner_id`,
 *        so reviews must follow the lead).
 *
 * @module customerReviewFollowUpContract
 */

import { isAuthoritativeBookingCompleted } from "@/lib/booking/deriveBookingOperationalPhase";

export type CustomerReviewFollowUpEligibility =
  | { allowed: true }
  | { allowed: false; skipReason: string };

/** Team or solo: enough context to prompt for a rating (SMS / lifecycle email). */
export function bookingHasReviewAssignee(row: Record<string, unknown>): boolean {
  const cid = String(row.cleaner_id ?? "").trim();
  if (cid) return true;
  if (row.is_team_job === true && String(row.team_id ?? "").trim()) return true;
  return false;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * Resolve the `reviews.cleaner_id` UUID to write at submission time.
 *
 * `reviews.cleaner_id` is NOT NULL in the DB schema, so we MUST hand it
 * a non-null UUID. Pre-H-8 the API only used `bookings.cleaner_id` and
 * therefore made team-assigned bookings (where `cleaner_id` is null and
 * `payout_owner_cleaner_id` carries the lead cleaner) silently
 * unreviewable.
 *
 * Resolution order:
 *   1. `bookings.cleaner_id` (single-cleaner / accepted-individual path).
 *   2. `bookings.payout_owner_cleaner_id` when `is_team_job === true`
 *      AND a UUID is set (lead cleaner of the team).
 *
 * The function returns `null` when neither produces a valid UUID. The
 * caller must NOT insert a review in that case — see
 * {@link evaluateCustomerReviewSubmissionEligibility}.
 *
 * Notes on isolation:
 *   - Does NOT change which cleaner gets paid — payout ownership is
 *     written at completion / payout time, this helper only READS it.
 *   - Does NOT widen visibility: only the lead cleaner's id is exposed
 *     via the existing `reviews.cleaner_id` column. Other team members
 *     remain unmentioned.
 */
export function resolveReviewCleanerIdForSubmission(row: Record<string, unknown>): string | null {
  const cleanerRaw = String(row.cleaner_id ?? "").trim();
  if (UUID_RE.test(cleanerRaw)) return cleanerRaw.toLowerCase();

  if (row.is_team_job === true) {
    const ownerRaw = String(row.payout_owner_cleaner_id ?? "").trim();
    if (UUID_RE.test(ownerRaw)) return ownerRaw.toLowerCase();
  }
  return null;
}

/**
 * Lightweight client-safe predicate: can this booking row be opened for
 * review submission? Mirrors {@link resolveReviewCleanerIdForSubmission}
 * shape so dashboard `Reviewable bookings` filters and the API stay in
 * lockstep.
 */
export function bookingIsReviewSubmissionEligibleAssignee(row: Record<string, unknown>): boolean {
  return resolveReviewCleanerIdForSubmission(row) != null;
}

/** Outbound review prompts (SMS queue worker, lifecycle `review_request` email). */
export function evaluateCustomerReviewPromptEligibility(row: Record<string, unknown>): CustomerReviewFollowUpEligibility {
  const st = String(row.status ?? "").trim().toLowerCase();

  if (st === "cancelled" || st === "failed" || st === "payment_expired") {
    return { allowed: false, skipReason: "review_prompt_terminal_booking" };
  }
  if (st === "pending_payment") {
    return { allowed: false, skipReason: "review_prompt_unpaid_checkout" };
  }

  if (!isAuthoritativeBookingCompleted(row as { status?: string | null; completed_at?: string | null })) {
    return { allowed: false, skipReason: "review_prompt_booking_not_completed" };
  }

  if (!bookingHasReviewAssignee(row)) {
    return { allowed: false, skipReason: "review_prompt_no_assignee" };
  }

  return { allowed: true };
}

/**
 * `POST /api/bookings/review` — DB requires `reviews.cleaner_id` (NOT NULL).
 *
 * Pre-H-8 this short-circuited on `cleaner_id` alone, which silently blocked
 * team-assigned bookings whose cleaner_id is cleared during team handoff.
 * Now uses {@link resolveReviewCleanerIdForSubmission} so the team-lead
 * (`payout_owner_cleaner_id` for team jobs) becomes a valid review target.
 *
 * Skip reason `review_submit_requires_cleaner_id` is preserved as the
 * shared block code for both "no individual cleaner" and "team job with
 * no payout owner". Ops dashboards / metric labels keying off this code
 * stay valid.
 */
export function evaluateCustomerReviewSubmissionEligibility(row: Record<string, unknown>): CustomerReviewFollowUpEligibility {
  const prompt = evaluateCustomerReviewPromptEligibility(row);
  if (!prompt.allowed) return prompt;

  if (resolveReviewCleanerIdForSubmission(row) == null) {
    return { allowed: false, skipReason: "review_submit_requires_cleaner_id" };
  }

  return { allowed: true };
}

/** Diagnostics for logs / tests (mirrors eligibility decisions). */
export function listCustomerReviewFollowUpIssues(row: Record<string, unknown>): Array<{ code: string; detail: string }> {
  const e = evaluateCustomerReviewPromptEligibility(row);
  if (e.allowed) return [];
  return [{ code: e.skipReason, detail: "review_prompt_blocked" }];
}
