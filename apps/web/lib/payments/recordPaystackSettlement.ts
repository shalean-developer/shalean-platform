import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaystackChargePayload } from "@/lib/payments/paymentTransactionTypes";
import { enqueueFailedJob } from "@/lib/booking/failedJobs";
import {
  recordGatewayPayment,
  type RecordGatewayPaymentResult,
} from "@/lib/payments/recordGatewayPayment";

/** Record Paystack charge settlement after booking finalize (idempotent). */
export async function recordPaystackBookingPayment(
  admin: SupabaseClient,
  opts: {
    reference: string;
    amountCents: number;
    bookingId: string;
    currency?: string;
    paidAtIso?: string | null;
    chargeData?: PaystackChargePayload;
  },
): Promise<RecordGatewayPaymentResult> {
  return recordGatewayPayment(admin, {
    gateway: "paystack",
    gatewayReference: opts.reference,
    entityType: "booking",
    entityId: opts.bookingId,
    amountCents: opts.amountCents,
    currencyCode: opts.currency ?? "ZAR",
    paidAtIso: opts.paidAtIso,
    paystackChargeData: opts.chargeData,
    bookingId: opts.bookingId,
  });
}

export async function recordPaystackMonthlyInvoicePayment(
  admin: SupabaseClient,
  opts: {
    reference: string;
    amountCents: number;
    invoiceId: string;
    paidAtIso?: string | null;
    chargeData?: PaystackChargePayload;
  },
): Promise<RecordGatewayPaymentResult> {
  return recordGatewayPayment(admin, {
    gateway: "paystack",
    gatewayReference: opts.reference,
    entityType: "monthly_invoice",
    entityId: opts.invoiceId,
    amountCents: opts.amountCents,
    paidAtIso: opts.paidAtIso,
    paystackChargeData: opts.chargeData,
  });
}

export async function recordPaystackSalesDocumentPayment(
  admin: SupabaseClient,
  opts: {
    reference: string;
    amountCents: number;
    documentId: string;
    bookingId?: string | null;
    paidAtIso?: string | null;
    chargeData?: PaystackChargePayload;
  },
): Promise<RecordGatewayPaymentResult> {
  return recordGatewayPayment(admin, {
    gateway: "paystack",
    gatewayReference: opts.reference,
    entityType: "sales_document",
    entityId: opts.documentId,
    amountCents: opts.amountCents,
    paidAtIso: opts.paidAtIso,
    paystackChargeData: opts.chargeData,
    bookingId: opts.bookingId ?? null,
  });
}

export type RecoverablePaystackEntitySettlement = {
  entityType: "monthly_invoice" | "sales_document";
  entityId: string;
  bookingId?: string | null;
  reference: string;
  amountCents: number;
  currency?: string;
  paidAtIso?: string | null;
  chargeData?: PaystackChargePayload;
};

export async function recordPaystackEntitySettlementWithRecovery(
  admin: SupabaseClient,
  opts: RecoverablePaystackEntitySettlement,
): Promise<RecordGatewayPaymentResult> {
  const result =
    opts.entityType === "monthly_invoice"
      ? await recordPaystackMonthlyInvoicePayment(admin, {
          reference: opts.reference,
          amountCents: opts.amountCents,
          invoiceId: opts.entityId,
          paidAtIso: opts.paidAtIso,
          chargeData: opts.chargeData,
        })
      : await recordPaystackSalesDocumentPayment(admin, {
          reference: opts.reference,
          amountCents: opts.amountCents,
          documentId: opts.entityId,
          bookingId: opts.bookingId ?? null,
          paidAtIso: opts.paidAtIso,
          chargeData: opts.chargeData,
        });

  if (!result.ok) {
    const recoveryQueued = await enqueueFailedJob("gateway_settlement_reconciliation", {
      ...opts,
      currency: opts.currency ?? "ZAR",
      chargeData: opts.chargeData ?? null,
      lastError: result.error,
    });
    if (!recoveryQueued) {
      throw new Error(
        `gateway_settlement_reconciliation_enqueue_failed:${result.error}`,
      );
    }
  }

  return result;
}

export function paystackChargeDataFromRecord(data: Record<string, unknown>): PaystackChargePayload {
  return {
    reference: typeof data.reference === "string" ? data.reference : undefined,
    amount: typeof data.amount === "number" ? data.amount : undefined,
    currency: typeof data.currency === "string" ? data.currency : undefined,
    fees: typeof data.fees === "number" ? data.fees : undefined,
    fees_breakdown: data.fees_breakdown,
    channel: typeof data.channel === "string" ? data.channel : undefined,
    paid_at: typeof data.paid_at === "string" ? data.paid_at : undefined,
    id: typeof data.id === "number" || typeof data.id === "string" ? data.id : undefined,
    international_format_transaction:
      typeof data.international_format_transaction === "boolean"
        ? data.international_format_transaction
        : undefined,
    authorization:
      data.authorization && typeof data.authorization === "object"
        ? (data.authorization as PaystackChargePayload["authorization"])
        : undefined,
  };
}
