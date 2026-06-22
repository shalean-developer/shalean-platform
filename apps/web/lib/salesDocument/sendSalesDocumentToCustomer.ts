import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { trustDocPageUrl } from "@/lib/pay/trustPayPageUrl";
import { initializePaystackForSalesDocument } from "@/lib/salesDocument/initializePaystackForSalesDocument";
import { sendSalesDocumentEmail } from "@/lib/salesDocument/sendSalesDocumentEmail";
import { syncSalesDocumentToZoho } from "@/lib/salesDocument/syncSalesDocumentToZoho";
import { trustSalesDocPayPageUrl } from "@/lib/pay/trustPayPageUrl";

function formatDueDate(isoDate: string | null): string {
  if (!isoDate) return "";
  try {
    const d = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
    return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return isoDate;
  }
}

export async function sendSalesDocumentToCustomer(
  admin: SupabaseClient,
  documentId: string,
): Promise<{ ok: true; viewUrl: string } | { ok: false; error: string }> {
  const { data, error } = await admin.from("sales_documents").select("*").eq("id", documentId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "document_not_found" };

  const row = data as {
    id: string;
    document_type: "quote" | "invoice";
    status: string;
    customer_email: string;
    customer_name: string;
    total_cents: number;
    due_date: string | null;
    public_token: string;
    balance_cents: number;
  };

  if (row.status === "void" || row.status === "paid") {
    return { ok: false, error: "invalid_status" };
  }
  if (row.status === "requested") {
    return { ok: false, error: "prepare_quote_before_send" };
  }
  if (row.total_cents <= 0) {
    return { ok: false, error: "total_required_before_send" };
  }

  const viewUrl = trustDocPageUrl(row.id, row.public_token);
  let paymentUrlForZoho: string | null = null;

  if (row.document_type === "invoice") {
    const pay = await initializePaystackForSalesDocument(admin, {
      documentId: row.id,
      customerEmail: row.customer_email,
    });
    if (!pay.ok) return { ok: false, error: pay.error };
    paymentUrlForZoho = trustSalesDocPayPageUrl(row.id, pay.reference, pay.authorizationUrl);
  }

  const zoho = await syncSalesDocumentToZoho(admin, row.id, { paymentUrl: paymentUrlForZoho });
  if (!zoho.ok) return { ok: false, error: `zoho:${zoho.error}` };

  const mail = await sendSalesDocumentEmail({
    to: row.customer_email,
    documentType: row.document_type,
    customerName: row.customer_name,
    totalZar: row.total_cents / 100,
    viewUrl,
    dueDateLabel: formatDueDate(row.due_date),
  });

  if (!mail.sent) return { ok: false, error: mail.error ?? "email_failed" };

  const nowIso = new Date().toISOString();
  const nextStatus = row.document_type === "quote" ? "sent" : "sent";
  const { error: statusErr } = await admin
    .from("sales_documents")
    .update({ status: nextStatus, sent_at: nowIso })
    .eq("id", row.id);

  if (statusErr) return { ok: false, error: statusErr.message };

  return { ok: true, viewUrl };
}
