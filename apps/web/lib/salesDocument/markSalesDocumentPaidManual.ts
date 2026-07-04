import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { notifyAdminSalesDocumentInvoicePaid } from "@/lib/salesDocument/notifySalesDocumentAdmin";
import { syncBookingPaymentFromSalesDocumentInvoice } from "@/lib/salesDocument/createBookingFromSalesQuoteInvoice";
import { markZohoInvoicePaid, todayYmdJhb } from "@/lib/zoho/zohoBooksService";

export async function markSalesDocumentPaidManual(
  admin: SupabaseClient,
  params: { documentId: string; note?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await admin
    .from("sales_documents")
    .select(
      "id, document_type, status, total_cents, balance_cents, zoho_invoice_id, customer_email, customer_name",
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
    balance_cents: number | null;
    zoho_invoice_id: string | null;
    customer_email: string;
    customer_name: string;
  };

  if (row.document_type !== "invoice") return { ok: false, error: "not_an_invoice" };
  const st = String(row.status ?? "").toLowerCase();
  if (st === "paid") return { ok: false, error: "already_paid" };
  if (!["sent", "accepted"].includes(st)) return { ok: false, error: "invalid_status" };

  const total = Math.max(0, Math.round(Number(row.total_cents ?? 0)));
  const nowIso = new Date().toISOString();

  const { error: updErr } = await admin
    .from("sales_documents")
    .update({
      status: "paid",
      amount_paid_cents: total,
      balance_cents: 0,
      notes: params.note ? params.note : undefined,
      updated_at: nowIso,
    })
    .eq("id", row.id);

  if (updErr) return { ok: false, error: updErr.message };

  const zohoId = String(row.zoho_invoice_id ?? "").trim();
  if (zohoId && process.env.ZOHO_CLIENT_ID && process.env.ZOHO_REFRESH_TOKEN) {
    await markZohoInvoicePaid({
      zohoInvoiceId: zohoId,
      amountZar: total / 100,
      paymentDate: todayYmdJhb(),
      reference: `manual_${row.id.slice(0, 8)}`,
      customerEmail: row.customer_email,
      customerName: row.customer_name,
    });
  }

  await notifyAdminSalesDocumentInvoicePaid(admin, {
    documentId: row.id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    totalCents: total,
    reference: `manual_${row.id.slice(0, 8)}`,
    source: "manual",
  });

  await syncBookingPaymentFromSalesDocumentInvoice(admin, row.id, {
    amountCents: total,
    reference: `manual_${row.id.slice(0, 8)}`,
  });

  return { ok: true };
}
