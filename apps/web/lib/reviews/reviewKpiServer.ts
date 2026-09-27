import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type ReviewKpiEventType = "review_submitted" | "review_prompt_sent" | "review_prompt_clicked";

/**
 * Writes a review KPI row to `user_events` (service role).
 * Callers may await this when the KPI must be durable before returning.
 */
export async function logReviewKpiEvent(
  eventType: ReviewKpiEventType,
  payload: Record<string, unknown> & { booking_id?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, error: "supabase_admin_unavailable" };
  const bookingId =
    typeof payload.booking_id === "string" && payload.booking_id.trim()
      ? payload.booking_id.trim()
      : null;
  const { error } = await admin.from("user_events").insert({
    user_id: null,
    booking_id: bookingId,
    event_type: eventType,
    payload: { ...payload, ingest_source: "review_system" },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
