import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isCompletableDisplayEarningsCents } from "@/lib/payout/bookingEarningsIntegrity";

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
  if (!isCompletableDisplayEarningsCents(params.payoutFrozenCents)) {
    return { ok: false, error: `invalid_payout_frozen_cents:${params.bookingId}` };
  }

  const { data: existing, error: readErr } = await admin
    .from("bookings")
    .select("payment_completed_at, paid_at, completed_at")
    .eq("id", params.bookingId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };

  const row = existing as {
    payment_completed_at?: string | null;
    paid_at?: string | null;
    completed_at?: string | null;
  } | null;
  const paymentCompletedAt =
    (typeof row?.payment_completed_at === "string" && row.payment_completed_at.trim()) ||
    (typeof row?.paid_at === "string" && row.paid_at.trim()) ||
    (typeof row?.completed_at === "string" && row.completed_at.trim()) ||
    new Date().toISOString();

  const { error } = await admin
    .from("bookings")
    .update({
      payment_status: "success",
      amount_paid_cents: params.amountPaidCents,
      payout_status: "eligible",
      payout_frozen_cents: params.payoutFrozenCents,
      payment_completed_at: paymentCompletedAt,
    })
    .eq("id", params.bookingId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
