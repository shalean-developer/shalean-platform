import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isCurrentPayoutVisitDate } from "@/lib/payout/payoutProcessingCutoff";
import { isCompletableDisplayEarningsCents } from "@/lib/payout/bookingEarningsIntegrity";

export type SettleMonthlyInvoiceChildBookingParams = {
  bookingId: string;
  amountPaidCents: number;
  payoutFrozenCents: number;
};

/**
 * Command boundary for monthly invoice settlement writes on child bookings.
 * Historical children use a paid-invoice-constrained cash RPC; forward children retain the existing payout update.
 */
export async function settleMonthlyInvoiceChildBooking(
  admin: SupabaseClient,
  params: SettleMonthlyInvoiceChildBookingParams,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: existing, error: readErr } = await admin
    .from("bookings")
    .select("date, monthly_invoice_id, payment_completed_at, paid_at, completed_at")
    .eq("id", params.bookingId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };

  const row = existing as {
    date?:string|null;
    monthly_invoice_id?:string|null;
    payment_completed_at?: string | null;
    paid_at?: string | null;
    completed_at?: string | null;
  } | null;
  if(row && 'date' in row && !isCurrentPayoutVisitDate(row.date)){
    if(!row.monthly_invoice_id) return {ok:false,error:'historical_monthly_child_missing_invoice'};
    const {error}=await admin.rpc('audit_03c02_settle_historical_monthly_child',{p_invoice_id:row.monthly_invoice_id,p_booking_id:params.bookingId});
    return error?{ok:false,error:error.message}:{ok:true};
  }
  if (!isCompletableDisplayEarningsCents(params.payoutFrozenCents)) return {ok:false,error:`invalid_payout_frozen_cents:${params.bookingId}`};
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
