import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type RecordCoveredSettlementResult =
  | { ok: true; created: boolean; paymentTransactionId: string }
  | { ok: false; error: string };

/**
 * Idempotent ledger row for R0 bookings fully covered by promo/referral/credit.
 * Uses gateway=other and gateway_reference `r0:{bookingId}` (unique).
 */
export async function recordCoveredSettlement(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    currencyCode?: string;
    paidAtIso?: string | null;
    /**
     * When true (default), also links `bookings.payment_transaction_id` if still null.
     * R0 settle prefers false so the booking success update can set cash + link atomically
     * against `bookings_paid_requires_amount`.
     */
    linkBookingPaymentTransactionId?: boolean;
  },
): Promise<RecordCoveredSettlementResult> {
  const bookingId = params.bookingId.trim();
  if (!bookingId) return { ok: false, error: "missing_booking_id" };
  const linkBooking = params.linkBookingPaymentTransactionId !== false;

  const ref = `r0:${bookingId}`;
  const { data: existing } = await admin
    .from("payment_transactions")
    .select("id")
    .eq("gateway", "other")
    .eq("gateway_reference", ref)
    .maybeSingle();

  if (existing?.id) {
    const paymentTransactionId = String(existing.id);
    if (linkBooking) {
      const { error: linkErr } = await admin
        .from("bookings")
        .update({ payment_transaction_id: paymentTransactionId })
        .eq("id", bookingId)
        .is("payment_transaction_id", null);
      if (linkErr) return { ok: false, error: linkErr.message };
    }
    return { ok: true, created: false, paymentTransactionId };
  }

  const paidAt = params.paidAtIso?.trim() || new Date().toISOString();
  const settlementDate = paidAt.slice(0, 10);

  const { data: inserted, error } = await admin
    .from("payment_transactions")
    .insert({
      gateway: "other",
      gateway_reference: ref,
      gateway_transaction_id: null,
      entity_type: "booking",
      entity_id: bookingId,
      amount_cents: 0,
      currency_code: (params.currencyCode ?? "ZAR").trim() || "ZAR",
      processing_fee_cents: 0,
      processing_fee_vat_cents: 0,
      net_settlement_cents: 0,
      fee_calculation_method: "manual",
      settlement_status: "settled",
      settlement_date: settlementDate,
      payment_channel: "promo_credit_cover",
      booking_id: bookingId,
      paid_at: paidAt,
      raw_gateway_payload: { reason: "fully_covered_by_promo_referral_or_credit" },
    })
    .select("id")
    .single();

  if (error) {
    // Race: unique (gateway, gateway_reference) — re-read.
    const { data: raced } = await admin
      .from("payment_transactions")
      .select("id")
      .eq("gateway", "other")
      .eq("gateway_reference", ref)
      .maybeSingle();
    if (raced?.id) {
      const paymentTransactionId = String(raced.id);
      if (linkBooking) {
        const { error: linkErr } = await admin
          .from("bookings")
          .update({ payment_transaction_id: paymentTransactionId })
          .eq("id", bookingId)
          .is("payment_transaction_id", null);
        if (linkErr) return { ok: false, error: linkErr.message };
      }
      return { ok: true, created: false, paymentTransactionId };
    }
    return { ok: false, error: error.message };
  }

  const paymentTransactionId = String((inserted as { id: string }).id);
  if (linkBooking) {
    const { error: linkErr } = await admin
      .from("bookings")
      .update({ payment_transaction_id: paymentTransactionId })
      .eq("id", bookingId)
      .is("payment_transaction_id", null);
    if (linkErr) return { ok: false, error: linkErr.message };
  }

  return { ok: true, created: true, paymentTransactionId };
}
