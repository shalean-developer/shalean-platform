import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { sendReviewEmail } from "@/lib/email/lifecycleEmails";
import { resolveBookingEmailLabelsFromRow } from "@/lib/notifications/bookingNotifyFormat";
import { evaluateCustomerReviewPromptEligibility } from "@/lib/reviews/customerReviewFollowUpContract";

export type SendAdminReviewRequestResult =
  | { ok: true; sentTo: string }
  | { ok: false; error: string; code: string };

const BOOKING_SELECT =
  "id, customer_email, customer_name, status, completed_at, cleaner_id, is_team_job, team_id, payout_owner_cleaner_id, booking_snapshot, date";

const SKIP_MESSAGES: Record<string, string> = {
  review_prompt_unpaid_checkout: "Booking is not paid — review requests are only sent for paid visits.",
  review_prompt_booking_not_completed: "Booking is not completed yet.",
  review_prompt_no_assignee: "Assign a cleaner or team before sending a review request.",
  review_prompt_terminal_booking: "Cancelled or failed bookings cannot receive review requests.",
};

function skipMessage(code: string): string {
  return SKIP_MESSAGES[code] ?? "This booking is not eligible for a review request.";
}

/** Admin-triggered review request email for a single completed booking. */
export async function sendAdminReviewRequestEmail(
  admin: SupabaseClient,
  bookingId: string,
): Promise<SendAdminReviewRequestResult> {
  const trimmedId = bookingId.trim();
  if (!trimmedId) {
    return { ok: false, error: "Missing booking id.", code: "missing_booking_id" };
  }

  const { data: booking, error } = await admin
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("id", trimmedId)
    .maybeSingle();

  if (error || !booking) {
    return { ok: false, error: "Booking not found.", code: "not_found" };
  }

  const row = booking as Record<string, unknown>;
  const email = normalizeEmail(String(row.customer_email ?? ""));
  if (!email || email.length < 3) {
    return { ok: false, error: "No customer email on this booking.", code: "no_customer_email" };
  }

  const eligibility = evaluateCustomerReviewPromptEligibility(row);
  if (!eligibility.allowed) {
    return { ok: false, error: skipMessage(eligibility.skipReason), code: eligibility.skipReason };
  }

  const { data: existingReview } = await admin
    .from("reviews")
    .select("id")
    .eq("booking_id", trimmedId)
    .maybeSingle();
  if (existingReview) {
    return {
      ok: false,
      error: "Customer already submitted a review for this booking.",
      code: "review_exists",
    };
  }

  const { serviceLabel, dateLabel, timeLabel, location } = resolveBookingEmailLabelsFromRow(row);
  const result = await sendReviewEmail(
    {
      bookingId: trimmedId,
      to: email,
      serviceLabel,
      dateLabel,
      timeLabel,
      location,
    },
    { logPromptKpi: true, promptKind: "manual", source: "admin_booking_action" },
  );

  if (!result.sent) {
    return { ok: false, error: result.error ?? "Email send failed.", code: "send_failed" };
  }

  return { ok: true, sentTo: email };
}
