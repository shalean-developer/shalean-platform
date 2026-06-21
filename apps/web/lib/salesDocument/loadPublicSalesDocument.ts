import "server-only";

import { findInvoiceForQuote } from "@/lib/salesDocument/acceptSalesQuote";
import { trustDocPageUrl } from "@/lib/pay/trustPayPageUrl";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SalesDocumentLineItem, SalesDocumentRow } from "@/lib/salesDocument/types";

export type PublicSalesDocumentView =
  | {
      ok: true;
      document: {
        id: string;
        document_type: "quote" | "invoice";
        status: string;
        customer_name: string;
        line_items: SalesDocumentLineItem[];
        total_cents: number;
        balance_cents: number;
        currency: string;
        due_date: string | null;
        notes: string | null;
        has_pdf: boolean;
        paystack_reference: string | null;
        invoice_view_url: string | null;
      };
    }
  | { ok: false; httpStatus: number; error: string };

export async function loadPublicSalesDocument(
  documentId: string,
  token: string,
): Promise<PublicSalesDocumentView> {
  const id = documentId.trim();
  const publicToken = token.trim();
  if (!id || !publicToken) {
    return { ok: false, httpStatus: 400, error: "Missing document id or access token." };
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return { ok: false, httpStatus: 503, error: "Service unavailable." };
  }

  const { data, error } = await admin
    .from("sales_documents")
    .select(
      "id, document_type, status, customer_name, line_items, total_cents, balance_cents, currency, due_date, notes, public_token, paystack_reference, zoho_estimate_id, zoho_invoice_id",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, httpStatus: 404, error: "We could not find this document." };
  }

  const row = data as SalesDocumentRow & {
    zoho_estimate_id?: string | null;
    zoho_invoice_id?: string | null;
  };

  if (String(row.public_token ?? "") !== publicToken) {
    return { ok: false, httpStatus: 403, error: "Invalid access token." };
  }

  if (row.status === "void") {
    return { ok: false, httpStatus: 410, error: "This document is no longer available." };
  }

  if (row.status === "requested" || row.status === "draft") {
    return {
      ok: false,
      httpStatus: 404,
      error: "This quote is not ready yet. We'll email you when it's available.",
    };
  }

  const isQuote = row.document_type === "quote";
  const hasPdf = isQuote
    ? Boolean(String(row.zoho_estimate_id ?? "").trim())
    : Boolean(String(row.zoho_invoice_id ?? "").trim());

  let invoiceViewUrl: string | null = null;
  if (isQuote && row.status === "accepted") {
    const linkedInvoice = await findInvoiceForQuote(admin, row.id);
    if (linkedInvoice) {
      invoiceViewUrl = trustDocPageUrl(linkedInvoice.id, linkedInvoice.public_token);
    }
  }

  return {
    ok: true,
    document: {
      id: row.id,
      document_type: row.document_type,
      status: row.status,
      customer_name: row.customer_name,
      line_items: Array.isArray(row.line_items) ? (row.line_items as SalesDocumentLineItem[]) : [],
      total_cents: row.total_cents,
      balance_cents: row.balance_cents,
      currency: row.currency,
      due_date: row.due_date,
      notes: row.notes,
      has_pdf: hasPdf,
      paystack_reference: row.paystack_reference,
      invoice_view_url: invoiceViewUrl,
    },
  };
}
