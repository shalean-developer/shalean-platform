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
  },
): Promise<RecordCoveredSettlementResult> {
  const bookingId = params.bookingId.trim();
  if (!bookingId) return { ok: false, error: "missing_booking_id" };

  const ref = `r0:${bookingId}`;
  const { data: existing } = await admin
    .from("payment_transactions")
    .select("id")
    .eq("gateway", "other")
    .eq("gateway_reference", ref)
    .maybeSingle();

  if (existing?.id) {
    return { ok: true, created: false, paymentTransactionId: String(existing.id) };
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
      return { ok: true, created: false, paymentTransactionId: String(raced.id) };
    }
    return { ok: false, error: error.message };
  }

  const paymentTransactionId = String((inserted as { id: string }).id);
  await admin
    .from("bookings")
    .update({ payment_transaction_id: paymentTransactionId })
    .eq("id", bookingId)
    .is("payment_transaction_id", null);

  return { ok: true, created: true, paymentTransactionId };
}
