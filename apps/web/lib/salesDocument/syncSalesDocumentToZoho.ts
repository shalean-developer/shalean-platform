import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createZohoEstimate,
  createZohoInvoice,
  updateZohoEstimate,
  updateZohoInvoice,
  todayYmdJhb,
} from "@/lib/zoho/zohoBooksService";
import {
  salesDocumentIsEditableWithoutPayment,
  salesDocumentLineItemsToZoho,
  type SalesDocumentLineItem,
  type SalesDocumentRow,
} from "@/lib/salesDocument/types";

function ymdOrToday(ymd: string | null | undefined): string {
  const s = String(ymd ?? "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return todayYmdJhb();
}

/**
 * Creates or updates Zoho Books estimate/invoice for a sales document.
 */
export async function syncSalesDocumentToZoho(
  admin: SupabaseClient,
  documentId: string,
  opts?: { paymentUrl?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!process.env.ZOHO_CLIENT_ID || !process.env.ZOHO_REFRESH_TOKEN) {
    return { ok: false, error: "zoho_not_configured" };
  }

  const { data, error } = await admin.from("sales_documents").select("*").eq("id", documentId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "document_not_found" };

  const row = data as SalesDocumentRow;
  const lineItems = Array.isArray(row.line_items) ? (row.line_items as SalesDocumentLineItem[]) : [];
  if (lineItems.length === 0) return { ok: false, error: "no_line_items" };

  const totalZar = Math.max(0, row.total_cents) / 100;
  if (totalZar <= 0) return { ok: false, error: "zero_total" };

  const zohoLineItems = salesDocumentLineItemsToZoho(lineItems);
  const invoiceDate = todayYmdJhb();
  const dueDate = ymdOrToday(row.due_date);
  const payNote = opts?.paymentUrl ? ` Pay via: ${opts.paymentUrl}` : "";
  const notes = `${row.notes ?? ""}${payNote}\nShalean sales document ${row.id}`.trim();
  const editableWithoutPayment = salesDocumentIsEditableWithoutPayment({
    document_type: row.document_type,
    status: row.status,
    amount_paid_cents: row.amount_paid_cents,
  });

  const contact = {
    customerEmail: row.customer_email,
    customerName: row.customer_name,
    customerPhone: row.customer_phone ?? undefined,
  };

  if (row.document_type === "quote") {
    const linked = String(row.zoho_estimate_id ?? "").trim();
    const expiryDate = row.due_date ? ymdOrToday(row.due_date) : undefined;

    if (linked && editableWithoutPayment) {
      const upd = await updateZohoEstimate({
        zohoEstimateId: linked,
        ...contact,
        lineItems: zohoLineItems,
        estimateDate: invoiceDate,
        expiryDate,
        notes,
        currencyCode: row.currency,
      });
      if (!upd.ok) return { ok: false, error: upd.error };
      return { ok: true };
    }

    if (linked) return { ok: true };

    const created = await createZohoEstimate({
      referenceId: row.id,
      ...contact,
      lineItems: zohoLineItems,
      estimateDate: invoiceDate,
      expiryDate,
      notes,
      currencyCode: row.currency,
    });
    if (!created.ok) return { ok: false, error: created.error };

    await admin
      .from("sales_documents")
      .update({ zoho_estimate_id: created.zohoEstimateId })
      .eq("id", documentId);
    return { ok: true };
  }

  const linkedInv = String(row.zoho_invoice_id ?? "").trim();
  if (linkedInv && editableWithoutPayment) {
    const upd = await updateZohoInvoice({
      zohoInvoiceId: linkedInv,
      ...contact,
      lineItems: zohoLineItems,
      invoiceDate,
      dueDate,
      notes,
      currencyCode: row.currency,
    });
    if (!upd.ok) return { ok: false, error: upd.error };
    return { ok: true };
  }

  if (linkedInv) return { ok: true };

  const created = await createZohoInvoice({
    referenceId: row.id,
    orderKind: "sales",
    ...contact,
    lineItems: zohoLineItems,
    invoiceDate,
    dueDate,
    notes,
    currencyCode: row.currency,
  });
  if (!created.ok) return { ok: false, error: created.error };

  await admin
    .from("sales_documents")
    .update({ zoho_invoice_id: created.zohoInvoiceId })
    .eq("id", documentId);

  return { ok: true };
}
