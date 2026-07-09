import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPaymentTransactionForBooking } from "@/lib/payments/recordGatewayPayment";

export async function resolveBookingGatewayProcessingFeeCents(
  admin: SupabaseClient,
  bookingId: string,
): Promise<number> {
  const tx = await loadPaymentTransactionForBooking(admin, bookingId);
  return tx?.processing_fee_cents ?? 0;
}

/** Approved booking-linked expenses excluding auto-recorded gateway fee rows. */
export async function sumApprovedBookingOperatingExpenses(
  admin: SupabaseClient,
  bookingId: string,
): Promise<number> {
  const { data, error } = await admin
    .from("expenses")
    .select("amount_cents, payment_transaction_id")
    .eq("booking_id", bookingId)
    .eq("status", "approved");

  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((e) => !e.payment_transaction_id)
    .reduce((s, e) => s + (e.amount_cents ?? 0), 0);
}
