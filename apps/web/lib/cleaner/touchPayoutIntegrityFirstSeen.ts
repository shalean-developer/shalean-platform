import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Returns stored `payout_integrity_first_seen_at` (ISO) after touch, or null on RPC failure / missing row. */
export async function touchPayoutIntegrityFirstSeen(
  admin: SupabaseClient,
  bookingId: string,
): Promise<string | null> {
  const { data, error } = await admin.rpc("touch_payout_integrity_first_seen", { p_booking_id: bookingId });
  if (error) return null;
  if (data == null) return null;
  if (typeof data === "string") return data;
  return String(data);
}
