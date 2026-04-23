import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Resolve `bookings.id` when Paystack metadata omits `shalean_booking_id` (same as `paystack_reference`). */
export async function bookingIdForPaystackReference(
  admin: SupabaseClient,
  reference: string,
): Promise<string | null> {
  const r = reference.trim();
  if (!r) return null;
  const { data, error } = await admin.from("bookings").select("id").eq("paystack_reference", r).maybeSingle();
  if (error || !data || typeof data !== "object" || !("id" in data)) return null;
  return String((data as { id: string }).id);
}
