import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { appendMonthlyInvoiceSnapshotEvent } from "@/lib/monthlyInvoice/invoiceSnapshotEvents";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { refundPaystackTransaction } from "@/lib/paystack/refundPaystackTransaction";

export type RefundMonthlyInvoicePaymentResult =
  | {
      ok: true;
      paystackRefunded: boolean;
      recordedOnly: boolean;
      alreadyReversedOnPaystack: boolean;
      refundReference: string | null;
      payoutEligibleBookings: number;
    }
  | { ok: false; error: string };

type RefundParams = {
  invoiceId: string;
  note?: string;
  recordOnly?: boolean;
  refundReference?: string;
};

async function resolveChargeReference(
  admin: SupabaseClient,
  invoiceId: string,
  paystackReference: string | null,
): Promise<
  | { ok: true; chargeRef: string | null; chargeAmount: number }
  | { ok: false; error: string }
> {
  const { data: chargeRows, error, count } = await admin
    .from("monthly_invoice_paystack_charge_dedup")
    .select("charge_reference, amount_cents", { count: "exact" })
    .eq("invoice_id", invoiceId);

  if (error) return { ok: false, error: error.message };

  // BILL-INV-002 Phase A (H02 stopgap): multi-charge refunds are unsafe until all rows are walked.
  if ((count ?? chargeRows?.length ?? 0) > 1) {
    return { ok: false, error: "multi_charge_refund_unsupported" };
  }

  const dedup = (chargeRows?.[0] ?? null) as {
    charge_reference?: string;
    amount_cents?: number;
  } | null;

  const chargeRef =
    (typeof dedup?.charge_reference === "string" && dedup.charge_reference.trim()) ||
    (paystackReference?.trim() || null);

  const chargeAmount = Math.max(0, Math.round(Number(dedup?.amount_cents ?? 0)));

  return { ok: true, chargeRef, chargeAmount };
}

async function reverseMonthlyInvoiceChildBookings(
  admin: SupabaseClient,
  invoiceId: string,
): Promise<{ payoutEligible: number }> {
  const { data: bookings, error } = await admin
    .from("bookings")
    .select("id, payout_status")
    .eq("monthly_invoice_id", invoiceId)
    .neq("status", "cancelled");

  if (error || !bookings?.length) return { payoutEligible: 0 };

  let payoutEligible = 0;
  for (const b of bookings) {
    const row = b as { id: string; payout_status: string | null };
    const ps = String(row.payout_status ?? "").toLowerCase();
    if (ps === "eligible" || ps === "paid") payoutEligible += 1;

    await admin
      .from("bookings")
      .update({
        payment_status: "pending_monthly",
        amount_paid_cents: 0,
        payout_status: null,
      })
      .eq("id", row.id);
  }

  return { payoutEligible };
}

export async function refundMonthlyInvoicePayment(
  admin: SupabaseClient,
  params: RefundParams,
): Promise<RefundMonthlyInvoicePaymentResult> {
  const { data, error } = await admin
    .from("monthly_invoices")
    .select(
      "id, status, total_amount_cents, amount_paid_cents, balance_cents, paystack_reference, refunded_at, refund_reference",
    )
    .eq("id", params.invoiceId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "invoice_not_found" };

  const row = data as {
    id: string;
    status: string | null;
    total_amount_cents: number | null;
    amount_paid_cents: number | null;
    balance_cents: number | null;
    paystack_reference: string | null;
    refunded_at: string | null;
    refund_reference: string | null;
  };

  const st = String(row.status ?? "").toLowerCase();
  if (st === "refunded") return { ok: false, error: "already_refunded" };
  if (st !== "paid") return { ok: false, error: "not_paid" };

  const paid = Math.max(0, Math.round(Number(row.amount_paid_cents ?? 0)));
  const total = Math.max(0, Math.round(Number(row.total_amount_cents ?? 0)));
  if (paid <= 0 && total <= 0) return { ok: false, error: "nothing_to_refund" };

  const amountCents = paid > 0 ? paid : total;
  const resolved = await resolveChargeReference(admin, row.id, row.paystack_reference);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const { chargeRef, chargeAmount } = resolved;
  const refundAmount = chargeAmount > 0 ? chargeAmount : amountCents;
  const pastedRefundRef = params.refundReference?.trim() || null;
  const nowIso = new Date().toISOString();

  let paystackRefunded = false;
  let alreadyReversedOnPaystack = false;
  let refundReference: string | null = pastedRefundRef;
  let recordedOnly = Boolean(params.recordOnly);

  if (params.recordOnly) {
    refundReference = pastedRefundRef ?? chargeRef;
  } else if (chargeRef) {
    const refundRes = await refundPaystackTransaction({
      transactionReference: chargeRef,
      amountCents: refundAmount > 0 ? refundAmount : undefined,
      merchantNote: params.note?.trim() || `Monthly invoice ${row.id} refund`,
    });
    if (!refundRes.ok) return { ok: false, error: refundRes.error };
    paystackRefunded = !refundRes.alreadyReversed;
    alreadyReversedOnPaystack = Boolean(refundRes.alreadyReversed);
    refundReference = pastedRefundRef ?? refundRes.refundReference;
    recordedOnly = false;
  } else {
    recordedOnly = true;
  }

  const { error: updErr } = await admin
    .from("monthly_invoices")
    .update({
      status: "refunded",
      amount_paid_cents: 0,
      is_overdue: false,
      refunded_at: nowIso,
      refund_reference: refundReference,
      updated_at: nowIso,
    })
    .eq("id", row.id);

  if (updErr) return { ok: false, error: updErr.message };

  const reversal = await reverseMonthlyInvoiceChildBookings(admin, row.id);

  await appendMonthlyInvoiceSnapshotEvent(
    admin,
    row.id,
    {
      kind: "payment_refunded",
      at: nowIso,
      amount_cents: amountCents,
      amount_paid_cents_after: 0,
      total_amount_cents: total,
      balance_cents_after: total,
      paystack_charge_reference: chargeRef ?? "",
      refund_reference: refundReference ?? "",
      recorded_only: recordedOnly,
      paystack_refunded: paystackRefunded,
      actor: "admin",
      reference: refundReference ?? chargeRef ?? "refund",
      ...(params.note?.trim() ? { note: params.note.trim().slice(0, 2000) } : {}),
    },
    { source: "monthly_invoice/refund" },
  );

  await logSystemEvent({
    level: "info",
    source: "monthly_invoice/refund",
    message: "monthly_invoice.refunded",
    context: {
      invoiceId: row.id,
      paystackRefunded,
      recordedOnly,
      alreadyReversedOnPaystack,
      refundReference,
      chargeReference: chargeRef,
      amountCents,
      payoutEligibleBookings: reversal.payoutEligible,
    },
  });

  return {
    ok: true,
    paystackRefunded,
    recordedOnly,
    alreadyReversedOnPaystack,
    refundReference,
    payoutEligibleBookings: reversal.payoutEligible,
  };
}
