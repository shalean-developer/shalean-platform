import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { recordUnifiedRefundAccounting } from "@/lib/accounting/recordUnifiedRefundAccounting";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { refundGatewayReference } from "@/lib/booking/refund/refundReconciliation";

export type RecordGatewayRefundResult =
  | { ok: true; created: boolean; paymentTransactionId: string }
  | { ok: false; error: string };

async function ensureUnifiedAccounting(
  admin: SupabaseClient,
  params: {
    paymentTransactionId: string;
    chargeReference: string;
    refundId: string;
    entityType: "booking" | "monthly_invoice" | "sales_document";
    entityId: string;
    amountCents: number;
    currencyCode?: string;
    refundedAtIso?: string | null;
    reason?: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const unified = await recordUnifiedRefundAccounting(admin, {
    entityType: params.entityType,
    entityId: params.entityId,
    paymentTransactionId: params.paymentTransactionId,
    provider: "paystack",
    chargeReference: params.chargeReference,
    refundReference: params.refundId,
    amountCents: params.amountCents,
    currencyCode: params.currencyCode ?? "ZAR",
    refundedAtIso: params.refundedAtIso,
    reason: params.reason,
  });
  return unified.ok ? { ok: true } : unified;
}

/**
 * Idempotent refund ledger row keyed by refund:{chargeRef}:{refundId}.
 * Original capture rows remain immutable; refunds are separate lines with settlement_status=reversed.
 * The same retry-safe path also ensures the unified accounting record and Zoho queue entry exist.
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
    reason?: string | null;
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
    const paymentTransactionId = String(existing.id);
    const accounting = await ensureUnifiedAccounting(admin, {
      paymentTransactionId,
      chargeReference: params.chargeReference,
      refundId: params.refundId,
      entityType: params.entityType,
      entityId: params.entityId,
      amountCents,
      currencyCode: params.currencyCode,
      refundedAtIso: params.refundedAtIso,
      reason: params.reason,
    });
    if (!accounting.ok) return accounting;
    return { ok: true, created: false, paymentTransactionId };
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
    // Unique race — converge through the same existing-row retry path.
    if (String(error.message).toLowerCase().includes("duplicate") || error.code === "23505") {
      const { data: again } = await admin
        .from("payment_transactions")
        .select("id")
        .eq("gateway", "paystack")
        .eq("gateway_reference", gatewayReference)
        .maybeSingle();
      if (again?.id) {
        const paymentTransactionId = String(again.id);
        const accounting = await ensureUnifiedAccounting(admin, {
          paymentTransactionId,
          chargeReference: params.chargeReference,
          refundId: params.refundId,
          entityType: params.entityType,
          entityId: params.entityId,
          amountCents,
          currencyCode: params.currencyCode,
          refundedAtIso: params.refundedAtIso,
          reason: params.reason,
        });
        if (!accounting.ok) return accounting;
        return { ok: true, created: false, paymentTransactionId };
      }
    }
    return { ok: false, error: error.message };
  }

  const paymentTransactionId = String((inserted as { id: string }).id);
  const accounting = await ensureUnifiedAccounting(admin, {
    paymentTransactionId,
    chargeReference: params.chargeReference,
    refundId: params.refundId,
    entityType: params.entityType,
    entityId: params.entityId,
    amountCents,
    currencyCode: params.currencyCode,
    refundedAtIso: now,
    reason: params.reason,
  });
  if (!accounting.ok) return accounting;

  await logSystemEvent({
    level: "info",
    source: "payments/recordGatewayRefund",
    message: "payment_transaction.refund_recorded",
    context: {
      paymentTransactionId,
      gatewayReference,
      entityType: params.entityType,
      entityId: params.entityId,
      amountCents,
    },
  });

  return {
    ok: true,
    created: true,
    paymentTransactionId,
  };
}
