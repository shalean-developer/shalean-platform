import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logSystemEvent } from "@/lib/logging/systemLog";
import { refundPaystackTransaction } from "@/lib/paystack/refundPaystackTransaction";

export type RefundSalesDocumentPaymentResult =
  | { ok: true; paystackRefunded: boolean; refundReference: string | null }
  | { ok: false; error: string };

export async function refundSalesDocumentPayment(
  admin: SupabaseClient,
  params: { documentId: string; note?: string },
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

  const { data: chargeRow } = await admin
    .from("sales_document_paystack_charge_dedup")
    .select("charge_reference, amount_cents")
    .eq("document_id", row.id)
    .maybeSingle();

  const chargeRef =
    typeof (chargeRow as { charge_reference?: string } | null)?.charge_reference === "string"
      ? String((chargeRow as { charge_reference: string }).charge_reference)
      : null;
  const chargeAmount = Math.max(
    0,
    Math.round(
      Number(
        (chargeRow as { amount_cents?: number } | null)?.amount_cents ??
          (paid > 0 ? paid : total),
      ),
    ),
  );

  let paystackRefunded = false;
  let refundReference: string | null = null;

  if (chargeRef) {
    const refundRes = await refundPaystackTransaction({
      transactionReference: chargeRef,
      amountCents: chargeAmount > 0 ? chargeAmount : undefined,
      merchantNote: params.note?.trim() || `Sales invoice ${row.id} refund`,
    });
    if (!refundRes.ok) return { ok: false, error: refundRes.error };
    paystackRefunded = true;
    refundReference = refundRes.refundReference;
  }

  const nowIso = new Date().toISOString();
  const noteLine = params.note?.trim()
    ? `Refund (${nowIso.slice(0, 10)}): ${params.note.trim()}`
    : `Refund recorded ${nowIso.slice(0, 10)}${paystackRefunded ? " via Paystack" : " (manual payment)"}`;
  const mergedNotes = [row.notes?.trim(), noteLine].filter(Boolean).join("\n\n");

  const { error: updErr } = await admin
    .from("sales_documents")
    .update({
      status: "refunded",
      amount_paid_cents: 0,
      balance_cents: total,
      refunded_at: nowIso,
      refund_reference: refundReference,
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
      paystackRefunded,
      refundReference,
      chargeReference: chargeRef,
      customerEmail: row.customer_email,
      amountCents: paid || total,
    },
  });

  return { ok: true, paystackRefunded, refundReference };
}
