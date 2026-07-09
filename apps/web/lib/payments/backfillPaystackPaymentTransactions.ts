import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { loadPaymentTransactionByReference, recordGatewayPayment } from "@/lib/payments/recordGatewayPayment";
import { paystackChargeDataFromRecord } from "@/lib/payments/recordPaystackSettlement";
import type { PaystackChargePayload } from "@/lib/payments/paymentTransactionTypes";
import {
  countMissingPaystackLedgerEntities,
  loadMissingPaystackLedgerEntities,
  type PaystackPaidEntity,
} from "@/lib/payments/paystackPaymentGaps";

export type BackfillPaystackPaymentsResult = {
  scanned: number;
  created: number;
  skipped_existing: number;
  failed: number;
  errors: Array<{ reference: string; error: string }>;
};

async function fetchPaystackVerifyCharge(
  reference: string,
  secret: string,
): Promise<PaystackChargePayload | null> {
  try {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const json = (await res.json()) as { status?: boolean; data?: Record<string, unknown> };
    if (!json.status || !json.data || json.data.status !== "success") return null;
    return paystackChargeDataFromRecord(json.data);
  } catch {
    return null;
  }
}

async function recordEntityPayment(
  admin: SupabaseClient,
  entity: PaystackPaidEntity,
  chargeData: PaystackChargePayload | null,
): Promise<{ ok: boolean; created?: boolean; error?: string }> {
  const amountCents = Math.round(entity.amount_cents ?? 0);
  if (amountCents <= 0) return { ok: false, error: "invalid_amount" };

  const bookingId = entity.entity_type === "booking" ? entity.entity_id : null;

  return recordGatewayPayment(admin, {
    gateway: "paystack",
    gatewayReference: entity.gateway_reference,
    entityType: entity.entity_type,
    entityId: entity.entity_id,
    amountCents,
    paidAtIso: entity.paid_at,
    paystackChargeData: chargeData ?? undefined,
    bookingId,
  });
}

/**
 * Backfill missing `payment_transactions` (+ linked Paystack fee expenses) for historical charges.
 * Idempotent — safe to run on a schedule.
 */
export async function backfillPaystackPaymentTransactions(
  admin: SupabaseClient,
  opts?: { limit?: number; verifyWithPaystack?: boolean },
): Promise<BackfillPaystackPaymentsResult> {
  const limit = Math.min(500, Math.max(1, opts?.limit ?? 50));
  const secret = opts?.verifyWithPaystack ? process.env.PAYSTACK_SECRET_KEY?.trim() : "";
  const result: BackfillPaystackPaymentsResult = {
    scanned: 0,
    created: 0,
    skipped_existing: 0,
    failed: 0,
    errors: [],
  };

  const missing = await loadMissingPaystackLedgerEntities(admin);
  const batch = missing.slice(0, limit);

  for (const entity of batch) {
    result.scanned += 1;

    const existing = await loadPaymentTransactionByReference(admin, "paystack", entity.gateway_reference);
    if (existing) {
      result.skipped_existing += 1;
      continue;
    }

    const chargeData = secret ? await fetchPaystackVerifyCharge(entity.gateway_reference, secret) : null;
    const recorded = await recordEntityPayment(admin, entity, chargeData);

    if (recorded.ok && recorded.created) {
      result.created += 1;
    } else if (recorded.ok) {
      result.skipped_existing += 1;
    } else {
      result.failed += 1;
      result.errors.push({ reference: entity.gateway_reference, error: recorded.error ?? "unknown" });
    }
  }

  await logSystemEvent({
    level: "info",
    source: "payments/backfillPaystackPaymentTransactions",
    message: "paystack_payment_backfill_complete",
    context: result,
  });

  return result;
}

export async function countMissingPaystackPaymentTransactions(admin: SupabaseClient): Promise<number> {
  return countMissingPaystackLedgerEntities(admin);
}
