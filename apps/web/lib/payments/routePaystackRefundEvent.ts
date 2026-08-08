import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { recordGatewayRefund } from "@/lib/booking/refund/recordGatewayRefund";

export type PaystackRefundRouteResult =
  | { kind: "booking" | "monthly_invoice" | "sales_document"; entityId: string }
  | { kind: "not_found" }
  | { kind: "ignored"; reason: string };

/**
 * Route a successful Paystack refund by the original charge reference.
 * The write is idempotent through recordGatewayRefund/refund_accounting_records.
 */
export async function routeSuccessfulPaystackRefund(
  admin: SupabaseClient,
  params: {
    chargeReference: string;
    refundReference: string;
    amountCents: number | null;
    refundedAtIso?: string | null;
    note?: string | null;
  },
): Promise<PaystackRefundRouteResult> {
  const chargeReference = params.chargeReference.trim();
  const refundReference = params.refundReference.trim();
  if (!chargeReference || !refundReference) return { kind: "ignored", reason: "missing_reference" };

  const { data: booking } = await admin
    .from("bookings")
    .select("id, amount_paid_cents, total_paid_cents, currency")
    .eq("paystack_reference", chargeReference)
    .maybeSingle();
  if (booking?.id) {
    const amountCents = Math.max(
      0,
      Math.round(Number(params.amountCents ?? booking.amount_paid_cents ?? booking.total_paid_cents ?? 0)),
    );
    if (amountCents <= 0) return { kind: "ignored", reason: "missing_amount" };
    await recordGatewayRefund(admin, {
      chargeReference,
      refundId: refundReference,
      entityType: "booking",
      entityId: String(booking.id),
      amountCents,
      currencyCode: String(booking.currency ?? "ZAR"),
      bookingId: String(booking.id),
      refundedAtIso: params.refundedAtIso,
      reason: params.note,
    });
    return { kind: "booking", entityId: String(booking.id) };
  }

  const { data: monthly } = await admin
    .from("monthly_invoice_paystack_charge_dedup")
    .select("invoice_id, amount_cents")
    .eq("charge_reference", chargeReference)
    .maybeSingle();
  if (monthly?.invoice_id) {
    const amountCents = Math.max(0, Math.round(Number(params.amountCents ?? monthly.amount_cents ?? 0)));
    if (amountCents <= 0) return { kind: "ignored", reason: "missing_amount" };
    await recordGatewayRefund(admin, {
      chargeReference,
      refundId: refundReference,
      entityType: "monthly_invoice",
      entityId: String(monthly.invoice_id),
      amountCents,
      refundedAtIso: params.refundedAtIso,
      reason: params.note,
    });
    return { kind: "monthly_invoice", entityId: String(monthly.invoice_id) };
  }

  const { data: sales } = await admin
    .from("sales_document_paystack_charge_dedup")
    .select("document_id, amount_cents")
    .eq("charge_reference", chargeReference)
    .maybeSingle();
  if (sales?.document_id) {
    const amountCents = Math.max(0, Math.round(Number(params.amountCents ?? sales.amount_cents ?? 0)));
    if (amountCents <= 0) return { kind: "ignored", reason: "missing_amount" };
    await recordGatewayRefund(admin, {
      chargeReference,
      refundId: refundReference,
      entityType: "sales_document",
      entityId: String(sales.document_id),
      amountCents,
      refundedAtIso: params.refundedAtIso,
      reason: params.note,
    });
    return { kind: "sales_document", entityId: String(sales.document_id) };
  }

  return { kind: "not_found" };
}
