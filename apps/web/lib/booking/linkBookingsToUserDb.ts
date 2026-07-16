import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { bookingCustomerOwnershipPatch } from "@/lib/booking/bookingCustomerIdentity";
import { resolveBookingOwnershipColumn } from "@/lib/customer/customerBookingsForUser";

/**
 * Sets ownership on rows that match email and are still unlinked. Service-role client only.
 * Uses `customer_id` or `user_id` based on the live schema (staging has `customer_id` only).
 */
export async function linkUnlinkedBookingsByEmail(
  admin: SupabaseClient,
  email: string,
  userId: string,
): Promise<{ data: { id: string }[] | null; error: { message: string } | null }> {
  const normalized = normalizeEmail(email);
  const ownershipColumn = await resolveBookingOwnershipColumn(admin);
  return admin
    .from("bookings")
    .update(bookingCustomerOwnershipPatch(userId, ownershipColumn))
    .is(ownershipColumn, null)
    .eq("customer_email", normalized)
    .select("id");
}
