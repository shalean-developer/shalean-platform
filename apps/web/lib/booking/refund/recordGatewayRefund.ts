import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logSystemEvent } from "@/lib/logging/systemLog";
import { refundGatewayReference } from "@/lib/booking/refund/refundReconciliation";

export type RecordGatewayRefundResult =
  | { ok: true; created: boolean; paymentTransactionId: string }
  | { ok: false; error: string };

/**
 * Idempotent refund ledger row keyed by refund:{chargeRef}:{refundId}.
 * Original capture rows remain immutable; refunds are separate lines with settlement_status=reversed.
 */
export async function recordGatewayRefund(
  admin: SupabaseClient,
  params: {
    chargeReference: string;
    refundId: string;
    entityType: "booking" | "monthly_invoice" | "sales_document";
    entityId: string;
    amountCents: number;
    currencyCode?: string;
    bookingId?: string | null;
    refundedAtIso?: string | null;
  },
): Promise<RecordGatewayRefundResult> {
  const amountCents = Math.max(0, Math.round(params.amountCents));
  if (amountCents <= 0) return { ok: false, error: "invalid_amount" };

  const gatewayReference = refundGatewayReference({
    chargeReference: params.chargeReference,
    refundId: params.refundId,
  });

  const { data: existing } = await admin
    .from("payment_transactions")
    .select("id")
    .eq("gateway", "paystack")
    .eq("gateway_reference", gatewayReference)
    .maybeSingle();

  if (existing?.id) {
    return { ok: true, created: false, paymentTransactionId: String(existing.id) };
  }

  const now = params.refundedAtIso ?? new Date().toISOString();
  const bookingId =
    params.bookingId ?? (params.entityType === "booking" ? params.entityId : null);

  const { data: inserted, error } = await admin
    .from("payment_transactions")
    .insert({
      gateway: "paystack",
      gateway_reference: gatewayReference,
      gateway_transaction_id: null,
      entity_type: params.entityType,
      entity_id: params.entityId,
      amount_cents: amountCents,
      currency_code: params.currencyCode ?? "ZAR",
      processing_fee_cents: 0,
      processing_fee_vat_cents: 0,
      net_settlement_cents: 0,
      fee_calculation_method: "manual",
      settlement_status: "reversed",
      payment_channel: "refund",
      booking_id: bookingId,
      raw_gateway_payload: {
        kind: "refund",
        charge_reference_masked: params.chargeReference
          ? `${params.chargeReference.slice(0, 4)}…`
          : null,
        refund_id: params.refundId,
      },
      paid_at: now,
    })
    .select("id")
    .single();

  if (error) {
    // Unique race — treat as idempotent success.
    if (String(error.message).toLowerCase().includes("duplicate") || error.code === "23505") {
      const { data: again } = await admin
        .from("payment_transactions")
        .select("id")
        .eq("gateway", "paystack")
        .eq("gateway_reference", gatewayReference)
        .maybeSingle();
      if (again?.id) {
        return { ok: true, created: false, paymentTransactionId: String(again.id) };
      }
    }
    return { ok: false, error: error.message };
  }

  await logSystemEvent({
    level: "info",
    source: "payments/recordGatewayRefund",
    message: "payment_transaction.refund_recorded",
    context: {
      paymentTransactionId: inserted?.id ?? null,
      gatewayReference,
      entityType: params.entityType,
      entityId: params.entityId,
      amountCents,
    },
  });

  return {
    ok: true,
    created: true,
    paymentTransactionId: String((inserted as { id: string }).id),
  };
}
