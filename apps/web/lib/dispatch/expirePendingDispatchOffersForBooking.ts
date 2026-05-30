import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Closes open dispatch offers when a booking is cancelled or otherwise withdrawn from dispatch.
 */
export async function expirePendingDispatchOffersForBooking(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<{ expiredCount: number; error?: string }> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("dispatch_offers")
    .update({ status: "expired", responded_at: nowIso })
    .eq("booking_id", bookingId)
    .eq("status", "pending")
    .select("id");

  if (error) {
    return { expiredCount: 0, error: error.message };
  }
  return { expiredCount: (data ?? []).length };
}
