import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { enqueueAccountingSync } from "@/lib/accounting/accountingSyncQueue";

export type UnifiedRefundEntityType = "booking" | "monthly_invoice" | "sales_document";

export async function recordUnifiedRefundAccounting(
  admin: SupabaseClient,
  params: {
    entityType: UnifiedRefundEntityType;
    entityId: string;
    paymentTransactionId?: string | null;
    provider?: "paystack" | "manual";
    chargeReference?: string | null;
    refundReference: string;
    amountCents: number;
    currencyCode?: string;
    refundedAtIso?: string | null;
    reason?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<{ ok: true; refundAccountingId: string } | { ok: false; error: string }> {
  const amountCents = Math.max(0, Math.round(params.amountCents));
  const refundReference = params.refundReference.trim();
  if (!refundReference) return { ok: false, error: "refund_reference_required" };
  if (amountCents <= 0) return { ok: false, error: "invalid_amount" };

  const provider = params.provider ?? "paystack";
  const chargeReference = params.chargeReference?.trim() || null;
  const refundKey = [provider, params.entityType, params.entityId, chargeReference ?? "no-charge", refundReference].join(":");
  const now = params.refundedAtIso ?? new Date().toISOString();

  const { data: existing, error: existingError } = await admin
    .from("refund_accounting_records")
    .select("id")
    .eq("refund_key", refundKey)
    .maybeSingle();
  if (existingError) return { ok: false, error: existingError.message };

  let refundAccountingId = existing?.id ? String(existing.id) : "";
  if (!refundAccountingId) {
    const { data: inserted, error: insertError } = await admin
      .from("refund_accounting_records")
      .insert({
        entity_type: params.entityType,
        entity_id: params.entityId,
        payment_transaction_id: params.paymentTransactionId ?? null,
        provider,
        charge_reference: chargeReference,
        refund_reference: refundReference,
        refund_key: refundKey,
        amount_cents: amountCents,
        currency_code: params.currencyCode ?? "ZAR",
        refund_status: "succeeded",
        refunded_at: now,
        reason: params.reason?.trim() || null,
        accounting_status: "pending",
        metadata: params.metadata ?? {},
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        const { data: raced } = await admin
          .from("refund_accounting_records")
          .select("id")
          .eq("refund_key", refundKey)
          .maybeSingle();
        if (raced?.id) refundAccountingId = String(raced.id);
      }
      if (!refundAccountingId) return { ok: false, error: insertError.message };
    } else {
      refundAccountingId = String((inserted as { id: string }).id);
    }
  }

  await enqueueAccountingSync(admin, {
    entityType: "refund",
    entityId: refundAccountingId,
    payload: {
      refund_key: refundKey,
      entity_type: params.entityType,
      entity_id: params.entityId,
    },
  });

  return { ok: true, refundAccountingId };
}
