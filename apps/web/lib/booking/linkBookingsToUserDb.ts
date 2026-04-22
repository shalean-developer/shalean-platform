import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";

/**
 * Sets `user_id` on rows that match email and are still unlinked. Service-role client only.
 */
export async function linkUnlinkedBookingsByEmail(
  admin: SupabaseClient,
  email: string,
  userId: string,
): Promise<{ data: { id: string }[] | null; error: { message: string } | null }> {
  const normalized = normalizeEmail(email);
  return admin
    .from("bookings")
    .update({ user_id: userId })
    .is("user_id", null)
    .eq("customer_email", normalized)
    .select("id");
}
