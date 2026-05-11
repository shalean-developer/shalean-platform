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
 * - Submission still requires **`cleaner_id`** for the `reviews.cleaner_id` FK (team lead row).
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

/** `POST /api/bookings/review` — DB requires `reviews.cleaner_id`. */
export function evaluateCustomerReviewSubmissionEligibility(row: Record<string, unknown>): CustomerReviewFollowUpEligibility {
  const prompt = evaluateCustomerReviewPromptEligibility(row);
  if (!prompt.allowed) return prompt;

  if (!String(row.cleaner_id ?? "").trim()) {
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
