import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type SettleMonthlyInvoiceChildBookingParams = {
  bookingId: string;
  amountPaidCents: number;
  payoutFrozenCents: number;
};

/**
 * Command boundary for monthly invoice settlement writes on child bookings.
 * Phase 1A deliberately preserves the existing update shape and filters.
 */
export async function settleMonthlyInvoiceChildBooking(
  admin: SupabaseClient,
  params: SettleMonthlyInvoiceChildBookingParams,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await admin
    .from("bookings")
    .update({
      payment_status: "success",
      amount_paid_cents: params.amountPaidCents,
      payout_status: "eligible",
      payout_frozen_cents: params.payoutFrozenCents,
    })
    .eq("id", params.bookingId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
