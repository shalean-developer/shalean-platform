import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { trustDocPageUrl } from "@/lib/pay/trustPayPageUrl";
import { convertSalesQuoteToInvoice } from "@/lib/salesDocument/salesDocumentMutations";
import { notifyAdminSalesQuoteAccepted } from "@/lib/salesDocument/notifySalesDocumentAdmin";
import { sendSalesDocumentToCustomer } from "@/lib/salesDocument/sendSalesDocumentToCustomer";
import { logSystemEvent } from "@/lib/logging/systemLog";

export async function findInvoiceForQuote(
  admin: SupabaseClient,
  quoteId: string,
): Promise<{ id: string; public_token: string } | null> {
  const { data, error } = await admin
    .from("sales_documents")
    .select("id, public_token")
    .eq("converted_from_id", quoteId)
    .eq("document_type", "invoice")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as { id?: string; public_token?: string };
  if (!row.id || !row.public_token) return null;
  return { id: row.id, public_token: row.public_token };
}

export type AcceptSalesQuoteResult =
  | {
      ok: true;
      invoiceId: string;
      viewUrl: string;
      alreadyExisted: boolean;
      emailSent: boolean;
    }
  | { ok: false; error: string };

/**
 * Customer accepts a quote: mark quote accepted, create linked invoice (idempotent),
 * sync Zoho, initialize Paystack, and email the invoice link.
 */
export async function acceptSalesQuoteAndCreateInvoice(
  admin: SupabaseClient,
  quoteId: string,
): Promise<AcceptSalesQuoteResult> {
  const existing = await findInvoiceForQuote(admin, quoteId);
  if (existing) {
    await admin.from("sales_documents").update({ status: "accepted" }).eq("id", quoteId);
    return {
      ok: true,
      invoiceId: existing.id,
      viewUrl: trustDocPageUrl(existing.id, existing.public_token),
      alreadyExisted: true,
      emailSent: false,
    };
  }

  const converted = await convertSalesQuoteToInvoice(admin, quoteId, null);
  if (!converted.ok) return converted;

  const { data: quoteRow } = await admin
    .from("sales_documents")
    .select("customer_name, customer_email, total_cents")
    .eq("id", quoteId)
    .maybeSingle();

  if (quoteRow) {
    const q = quoteRow as {
      customer_name?: string;
      customer_email?: string;
      total_cents?: number | null;
    };
    void notifyAdminSalesQuoteAccepted(admin, {
      quoteId,
      invoiceId: converted.invoiceId,
      customerName: String(q.customer_name ?? ""),
      customerEmail: String(q.customer_email ?? ""),
      totalCents: Math.max(0, Math.round(Number(q.total_cents ?? 0))),
    });
  }

  let emailSent = false;
  const sent = await sendSalesDocumentToCustomer(admin, converted.invoiceId);
  if (sent.ok) {
    emailSent = true;
  } else {
    await logSystemEvent({
      level: "warn",
      source: "sales_document/accept_quote",
      message: "invoice_send_after_accept_failed",
      context: { quoteId, invoiceId: converted.invoiceId, error: sent.error },
    });
  }

  const { data: inv, error: invErr } = await admin
    .from("sales_documents")
    .select("id, public_token")
    .eq("id", converted.invoiceId)
    .maybeSingle();

  if (invErr || !inv) {
    return { ok: false, error: invErr?.message ?? "invoice_load_failed" };
  }

  const row = inv as { id: string; public_token: string };
  return {
    ok: true,
    invoiceId: row.id,
    viewUrl: trustDocPageUrl(row.id, row.public_token),
    alreadyExisted: false,
    emailSent,
  };
}
