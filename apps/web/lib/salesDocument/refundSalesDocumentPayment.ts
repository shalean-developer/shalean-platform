import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logSystemEvent } from "@/lib/logging/systemLog";
import { refundPaystackTransaction } from "@/lib/paystack/refundPaystackTransaction";

export type RefundSalesDocumentPaymentResult =
  | {
      ok: true;
      paystackRefunded: boolean;
      recordedOnly: boolean;
      alreadyReversedOnPaystack: boolean;
      refundReference: string | null;
    }
  | { ok: false; error: string };

type RefundParams = {
  documentId: string;
  note?: string;
  /** Skip Paystack API — use when refund was done in the Paystack dashboard. */
  recordOnly?: boolean;
  /** Optional Paystack refund id/reference from the dashboard. */
  refundReference?: string;
};

async function resolveChargeReference(
  admin: SupabaseClient,
  documentId: string,
  paystackReference: string | null,
): Promise<
  | { ok: true; chargeRef: string | null; chargeAmount: number }
  | { ok: false; error: string }
> {
  const { data: chargeRows, error, count } = await admin
    .from("sales_document_paystack_charge_dedup")
    .select("charge_reference, amount_cents", { count: "exact" })
    .eq("document_id", documentId);

  if (error) return { ok: false, error: error.message };

  // P3 finance integrity: a sales document can have more than one captured charge.
  // Refunding only the first row can leave cash and accounting state inconsistent,
  // so fail closed until the unified refund ledger can walk every charge safely.
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

async function markSalesDocumentRefunded(
  admin: SupabaseClient,
  row: {
    id: string;
    total_cents: number | null;
    notes: string | null;
  },
  params: {
    note?: string;
    refundReference: string | null;
    paystackRefunded: boolean;
    recordedOnly: boolean;
    alreadyReversedOnPaystack: boolean;
    chargeReference: string | null;
    amountCents: number;
    customerEmail: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const total = Math.max(0, Math.round(Number(row.total_cents ?? 0)));
  const nowIso = new Date().toISOString();

  let noteLine = params.note?.trim()
    ? `Refund (${nowIso.slice(0, 10)}): ${params.note.trim()}`
    : `Refund recorded ${nowIso.slice(0, 10)}`;

  if (params.recordedOnly) {
    noteLine += " (recorded in Shalean — refunded on Paystack dashboard)";
  } else if (params.alreadyReversedOnPaystack) {
    noteLine += " (already reversed on Paystack)";
  } else if (params.paystackRefunded) {
    noteLine += " via Paystack";
  } else {
    noteLine += " (manual payment)";
  }

  const mergedNotes = [row.notes?.trim(), noteLine].filter(Boolean).join("\n\n");

  const { error: updErr } = await admin
    .from("sales_documents")
    .update({
      status: "refunded",
      amount_paid_cents: 0,
      balance_cents: total,
      refunded_at: nowIso,
      refund_reference: params.refundReference,
      notes: mergedNotes,
      updated_at: nowIso,
    })
    .eq("id", row.id);

  if (updErr) return { ok: false, error: updErr.message };

  await logSystemEvent({
    level: "info",
    source: "sales_document/refund",
    message: "sales_document.refunded",
    context: {
      documentId: row.id,
      paystackRefunded: params.paystackRefunded,
      recordedOnly: params.recordedOnly,
      alreadyReversedOnPaystack: params.alreadyReversedOnPaystack,
      refundReference: params.refundReference,
      chargeReference: params.chargeReference,
      customerEmail: params.customerEmail,
      amountCents: params.amountCents,
    },
  });

  return { ok: true };
}

export async function refundSalesDocumentPayment(
  admin: SupabaseClient,
  params: RefundParams,
): Promise<RefundSalesDocumentPaymentResult> {
  const { data, error } = await admin
    .from("sales_documents")
    .select(
      "id, document_type, status, total_cents, amount_paid_cents, balance_cents, paystack_reference, customer_name, customer_email, notes",
    )
    .eq("id", params.documentId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "document_not_found" };

  const row = data as {
    id: string;
    document_type: string;
    status: string | null;
    total_cents: number | null;
    amount_paid_cents: number | null;
    balance_cents: number | null;
    paystack_reference: string | null;
    customer_name: string;
    customer_email: string;
    notes: string | null;
  };

  if (row.document_type !== "invoice") return { ok: false, error: "not_an_invoice" };

  const st = String(row.status ?? "").toLowerCase();
  if (st === "refunded") return { ok: false, error: "already_refunded" };
  if (st !== "paid") return { ok: false, error: "not_paid" };

  const total = Math.max(0, Math.round(Number(row.total_cents ?? 0)));
  const paid = Math.max(0, Math.round(Number(row.amount_paid_cents ?? 0)));
  if (paid <= 0 && total <= 0) return { ok: false, error: "nothing_to_refund" };

  const amountCents = paid > 0 ? paid : total;
  const resolved = await resolveChargeReference(admin, row.id, row.paystack_reference);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const { chargeRef, chargeAmount } = resolved;
  const refundAmount = chargeAmount > 0 ? chargeAmount : amountCents;
  const pastedRefundRef = params.refundReference?.trim() || null;

  if (params.recordOnly) {
    const marked = await markSalesDocumentRefunded(admin, row, {
      note: params.note,
      refundReference: pastedRefundRef ?? chargeRef,
      paystackRefunded: false,
      recordedOnly: true,
      alreadyReversedOnPaystack: Boolean(chargeRef),
      chargeReference: chargeRef,
      amountCents,
      customerEmail: row.customer_email,
    });
    if (!marked.ok) return marked;
    return {
      ok: true,
      paystackRefunded: false,
      recordedOnly: true,
      alreadyReversedOnPaystack: Boolean(chargeRef),
      refundReference: pastedRefundRef ?? chargeRef,
    };
  }

  let paystackRefunded = false;
  let alreadyReversedOnPaystack = false;
  let refundReference: string | null = pastedRefundRef;

  if (chargeRef) {
    const refundRes = await refundPaystackTransaction({
      transactionReference: chargeRef,
      amountCents: refundAmount > 0 ? refundAmount : undefined,
      merchantNote: params.note?.trim() || `Sales invoice ${row.id} refund`,
    });
    if (!refundRes.ok) return { ok: false, error: refundRes.error };
    paystackRefunded = !refundRes.alreadyReversed;
    alreadyReversedOnPaystack = Boolean(refundRes.alreadyReversed);
    refundReference = pastedRefundRef ?? refundRes.refundReference;
  }

  const marked = await markSalesDocumentRefunded(admin, row, {
    note: params.note,
    refundReference,
    paystackRefunded,
    recordedOnly: false,
    alreadyReversedOnPaystack,
    chargeReference: chargeRef,
    amountCents,
    customerEmail: row.customer_email,
  });
  if (!marked.ok) return marked;

  return {
    ok: true,
    paystackRefunded,
    recordedOnly: false,
    alreadyReversedOnPaystack,
    refundReference,
  };
}
