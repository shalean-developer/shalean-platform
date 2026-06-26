import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { applySalesDocumentPayment } from "@/lib/salesDocument/applySalesDocumentPayment";
import { findSuccessfulPaystackChargeForSalesDocument } from "@/lib/salesDocument/findSuccessfulPaystackChargeForSalesDocument";

export type ReconcileSalesDocumentPaymentResult =
  | { ok: true; alreadyPaid: boolean; documentId: string; reference: string }
  | { ok: false; error: string };

/**
 * Re-fetch Paystack for a sales invoice and apply payment if the charge succeeded.
 */
export async function reconcileSalesDocumentPayment(
  admin: SupabaseClient,
  params: { documentId: string; paystackReference?: string | null },
): Promise<ReconcileSalesDocumentPaymentResult> {
  const documentId = params.documentId.trim();

  const { data, error } = await admin
    .from("sales_documents")
    .select("id, document_type, status, customer_email")
    .eq("id", documentId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "document_not_found" };

  const row = data as {
    id: string;
    document_type: string;
    status: string | null;
    customer_email: string;
  };

  if (row.document_type !== "invoice") return { ok: false, error: "not_an_invoice" };

  const st = String(row.status ?? "").toLowerCase();
  if (st === "paid") return { ok: true, alreadyPaid: true, documentId: row.id, reference: "" };
  if (st === "refunded") return { ok: false, error: "refunded" };

  const found = await findSuccessfulPaystackChargeForSalesDocument(admin, {
    documentId: row.id,
    customerEmail: row.customer_email,
    overrideReference: params.paystackReference,
  });
  if ("ok" in found) {
    return { ok: false, error: found.error };
  }
  const charge = found;

  const outcome = await applySalesDocumentPayment(admin, {
    reference: charge.reference,
    amountCents: charge.amountCents,
    documentIdHint: row.id,
  });

  if (outcome.ok && "skipped" in outcome && outcome.skipped) {
    if (outcome.reason === "already_paid" || outcome.reason === "duplicate_charge") {
      return { ok: true, alreadyPaid: true, documentId: row.id, reference: charge.reference };
    }
    return { ok: false, error: "paystack_paid_but_document_not_matched" };
  }
  if (outcome.ok && "settled" in outcome) {
    return { ok: true, alreadyPaid: false, documentId: outcome.documentId, reference: charge.reference };
  }
  if (!outcome.ok) return { ok: false, error: outcome.error };

  return { ok: false, error: "reconcile_failed" };
}
