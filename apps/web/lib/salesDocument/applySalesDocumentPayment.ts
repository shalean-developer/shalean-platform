import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logSystemEvent } from "@/lib/logging/systemLog";
import { notifyAdminSalesDocumentInvoicePaid } from "@/lib/salesDocument/notifySalesDocumentAdmin";
import { syncBookingPaymentFromSalesDocumentInvoice } from "@/lib/salesDocument/createBookingFromSalesQuoteInvoice";
import { resolveSalesDocumentForPaystackCharge } from "@/lib/salesDocument/resolveSalesDocumentForPaystackCharge";
import { salesDocumentPaystackReferencesMatch } from "@/lib/salesDocument/salesDocumentPaystackReference";
import { markZohoInvoicePaid, todayYmdJhb } from "@/lib/zoho/zohoBooksService";

export type ApplySalesDocumentPaymentResult =
  | { ok: true; skipped: true; reason: "not_found" | "already_paid" | "duplicate_charge" }
  | { ok: true; settled: "full"; documentId: string }
  | { ok: false; error: string };

export async function applySalesDocumentPayment(
  admin: SupabaseClient,
  params: { reference: string; amountCents: number; documentIdHint?: string | null },
): Promise<ApplySalesDocumentPaymentResult> {
  const ref = params.reference.trim();
  if (!ref) return { ok: false, error: "missing_reference" };

  const paidIn = Math.max(0, Math.round(params.amountCents));

  let row;
  try {
    row = await resolveSalesDocumentForPaystackCharge(admin, {
      reference: ref,
      documentIdHint: params.documentIdHint,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "lookup_failed" };
  }

  if (!row) return { ok: true, skipped: true, reason: "not_found" };
  if (row.document_type !== "invoice") return { ok: false, error: "not_an_invoice" };

  const total = Math.max(0, Math.round(Number(row.total_cents ?? 0)));
  if (paidIn !== total) {
    await logSystemEvent({
      level: "error",
      source: "sales_document/payment",
      message: "sales_document.payment_amount_mismatch",
      context: { documentId: row.id, reference: ref, paidInCents: paidIn, expectedCents: total },
    });
    return { ok: false, error: `amount_mismatch:${paidIn}:${total}` };
  }

  const st = String(row.status ?? "").toLowerCase();
  if (st === "paid") return { ok: true, skipped: true, reason: "already_paid" };
  if (!["sent", "accepted"].includes(st)) {
    return { ok: false, error: `document_not_payable_status:${st || "unknown"}` };
  }

  if (!salesDocumentPaystackReferencesMatch(row.id, row.paystack_reference, ref)) {
    const { error: refPatchErr } = await admin
      .from("sales_documents")
      .update({ paystack_reference: ref })
      .eq("id", row.id);
    if (refPatchErr) return { ok: false, error: refPatchErr.message };
  }

  let dedupInserted = false;
  const { error: dedupErr } = await admin.from("sales_document_paystack_charge_dedup").insert({
    charge_reference: ref,
    document_id: row.id,
    amount_cents: paidIn,
  });

  if (dedupErr) {
    const code = (dedupErr as { code?: string }).code;
    if (code === "23505") return { ok: true, skipped: true, reason: "duplicate_charge" };
    return { ok: false, error: dedupErr.message };
  } else {
    dedupInserted = true;
  }

  const nowIso = new Date().toISOString();
  const { error: updErr } = await admin
    .from("sales_documents")
    .update({
      status: "paid",
      amount_paid_cents: total,
      balance_cents: 0,
      paystack_reference: ref,
      updated_at: nowIso,
    })
    .eq("id", row.id);
  if (updErr) return { ok: false, error: updErr.message };

  const zohoId = String(row.zoho_invoice_id ?? "").trim();
  if (zohoId && process.env.ZOHO_CLIENT_ID && process.env.ZOHO_REFRESH_TOKEN) {
    const zohoRes = await markZohoInvoicePaid({
      zohoInvoiceId: zohoId,
      amountZar: total / 100,
      paymentDate: todayYmdJhb(),
      reference: ref,
      customerEmail: row.customer_email,
      customerName: row.customer_name,
    });
    if (!zohoRes.ok) {
      await logSystemEvent({
        level: "warn",
        source: "sales_document/payment",
        message: "zoho_mark_paid_failed",
        context: { documentId: row.id, error: zohoRes.error },
      });
    }
  }

  await logSystemEvent({
    level: "info",
    source: "sales_document/payment",
    message: "sales_document.paid",
    context: { documentId: row.id, reference: ref, amountCents: paidIn, dedupInserted },
  });

  await notifyAdminSalesDocumentInvoicePaid(admin, {
    documentId: row.id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    totalCents: total,
    reference: ref,
    source: "paystack",
  });

  await syncBookingPaymentFromSalesDocumentInvoice(admin, row.id, {
    amountCents: total,
    reference: ref,
  });

  return { ok: true, settled: "full", documentId: row.id };
}
