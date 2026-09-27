import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { evaluateCustomerReviewSubmissionEligibility } from "@/lib/reviews/customerReviewFollowUpContract";

const REVIEW_DELAY_MS = 30 * 60 * 1000;

export type EnsureReviewFollowUpResult =
  | { ok: true; created: boolean; reason: "created" | "existing_review" | "ineligible" | "missing_email" | "duplicate_job" }
  | { ok: false; error: string };

/**
 * Ensures one review_request lifecycle job exists after authoritative completion.
 *
 * This is intentionally completion-time, not payment-time only, so recurring,
 * monthly-invoice, admin-created, repaired and other legitimate completion paths
 * converge on the same customer review follow-up.
 */
export async function ensureReviewFollowUpForCompletedBooking(
  supabase: SupabaseClient,
  booking: Record<string, unknown>,
): Promise<EnsureReviewFollowUpResult> {
  const bookingId = String(booking.id ?? "").trim();
  if (!bookingId) return { ok: false, error: "missing_booking_id" };

  const eligibility = evaluateCustomerReviewSubmissionEligibility(booking);
  if (!eligibility.allowed) {
    return { ok: true, created: false, reason: "ineligible" };
  }

  const rawEmail = String(booking.customer_email ?? "").trim();
  let customerEmail = "";
  try {
    customerEmail = rawEmail ? normalizeEmail(rawEmail) : "";
  } catch {
    customerEmail = "";
  }
  if (!customerEmail) {
    return { ok: true, created: false, reason: "missing_email" };
  }

  const { data: existingReview, error: reviewErr } = await supabase
    .from("reviews")
    .select("id")
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (reviewErr) {
    await reportOperationalIssue("warn", "ensureReviewFollowUp", reviewErr.message, { bookingId, phase: "review_lookup" });
    return { ok: false, error: reviewErr.message };
  }
  if (existingReview) {
    return { ok: true, created: false, reason: "existing_review" };
  }

  const scheduledFor = new Date(Date.now() + REVIEW_DELAY_MS).toISOString();
  const { error } = await supabase.from("booking_lifecycle_jobs").insert({
    booking_id: bookingId,
    user_id: null,
    customer_email: customerEmail,
    job_type: "review_request",
    scheduled_for: scheduledFor,
    status: "pending",
    attempts: 0,
    payload: { source: "completion_ensure_v1" },
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: true, created: false, reason: "duplicate_job" };
    }
    await reportOperationalIssue("warn", "ensureReviewFollowUp", error.message, { bookingId, phase: "job_insert" });
    return { ok: false, error: error.message };
  }

  return { ok: true, created: true, reason: "created" };
}
