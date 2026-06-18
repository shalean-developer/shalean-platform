import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadBookingReferenceForId(
  admin: SupabaseClient,
  bookingId: string | null | undefined,
): Promise<string | null> {
  const id = String(bookingId ?? "").trim();
  if (!id) return null;
  const { data, error } = await admin
    .from("bookings")
    .select("booking_reference")
    .eq("id", id)
    .maybeSingle();
  if (error || !data || typeof data !== "object") return null;
  const ref = String((data as { booking_reference?: unknown }).booking_reference ?? "").trim();
  return ref || null;
}
