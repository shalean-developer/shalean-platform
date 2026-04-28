import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type ReviewKpiEventType = "review_submitted" | "review_prompt_sent" | "review_prompt_clicked";

/**
 * Fire-and-forget KPI row in `user_events` (service role). Safe when admin is unset (no-op).
 */
export function logReviewKpiEvent(
  eventType: ReviewKpiEventType,
  payload: Record<string, unknown> & { booking_id?: string | null },
): void {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const bookingId = typeof payload.booking_id === "string" && payload.booking_id.trim() ? payload.booking_id.trim() : null;
  void admin.from("user_events").insert({
    user_id: null,
    booking_id: bookingId,
    event_type: eventType,
    payload: { ...payload, ingest_source: "review_system" },
  });
}
