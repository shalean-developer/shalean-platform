import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logSystemEvent } from "@/lib/logging/systemLog";
import { notifyAdminSalesDocumentInvoicePaid } from "@/lib/salesDocument/notifySalesDocumentAdmin";
import { markZohoInvoicePaid, todayYmdJhb } from "@/lib/zoho/zohoBooksService";

export type ApplySalesDocumentPaymentResult =
  | { ok: true; skipped: true; reason: "not_found" | "already_paid" | "duplicate_charge" }
  | { ok: true; settled: "full"; documentId: string }
  | { ok: false; error: string };

export async function applySalesDocumentPayment(
  admin: SupabaseClient,
  params: { reference: string; amountCents: number },
): Promise<ApplySalesDocumentPaymentResult> {
  const ref = params.reference.trim();
  if (!ref) return { ok: false, error: "missing_reference" };

  const paidIn = Math.max(0, Math.round(params.amountCents));

  const { data: doc, error: docErr } = await admin
    .from("sales_documents")
    .select(
      "id, status, document_type, total_cents, amount_paid_cents, balance_cents, zoho_invoice_id, customer_email, customer_name",
    )
    .eq("paystack_reference", ref)
    .maybeSingle();

  if (docErr) return { ok: false, error: docErr.message };
  if (!doc || typeof (doc as { id?: string }).id !== "string") {
    return { ok: true, skipped: true, reason: "not_found" };
  }

  const row = doc as {
    id: string;
    status: string | null;
    document_type: string;
    total_cents: number | null;
    amount_paid_cents: number | null;
    balance_cents: number | null;
    zoho_invoice_id: string | null;
    customer_email: string;
    customer_name: string;
  };

  if (row.document_type !== "invoice") {
    return { ok: false, error: "not_an_invoice" };
  }

  const st = String(row.status ?? "").toLowerCase();
  if (st === "paid") {
    return { ok: true, skipped: true, reason: "already_paid" };
  }

  if (!["sent", "accepted"].includes(st)) {
    return { ok: false, error: `document_not_payable_status:${st || "unknown"}` };
  }

  const { error: dedupErr } = await admin.from("sales_document_paystack_charge_dedup").insert({
    charge_reference: ref,
    document_id: row.id,
    amount_cents: paidIn,
  });

  if (dedupErr) {
    const code = (dedupErr as { code?: string }).code;
    if (code === "23505") {
      return { ok: true, skipped: true, reason: "duplicate_charge" };
    }
    return { ok: false, error: dedupErr.message };
  }

  const total = Math.max(0, Math.round(Number(row.total_cents ?? 0)));
  const nowIso = new Date().toISOString();

  const { error: updErr } = await admin
    .from("sales_documents")
    .update({
      status: "paid",
      amount_paid_cents: total,
      balance_cents: 0,
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
    context: { documentId: row.id, reference: ref, amountCents: paidIn },
  });

  void notifyAdminSalesDocumentInvoicePaid(admin, {
    documentId: row.id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    totalCents: total,
    reference: ref,
    source: "paystack",
  });

  return { ok: true, settled: "full", documentId: row.id };
}
