import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createZohoEstimate,
  createZohoInvoice,
  markZohoEstimateSent,
  markZohoInvoiceSent,
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
 * Resolves the Zoho estimate id of the quote a sales invoice was converted
 * from, so the new Zoho invoice can be linked back to that estimate.
 */
async function resolveSourceZohoEstimateId(
  admin: SupabaseClient,
  convertedFromId: string | null | undefined,
): Promise<string | undefined> {
  const quoteId = String(convertedFromId ?? "").trim();
  if (!quoteId) return undefined;
  const { data } = await admin
    .from("sales_documents")
    .select("zoho_estimate_id")
    .eq("id", quoteId)
    .maybeSingle();
  const estimateId = String((data as { zoho_estimate_id?: string | null } | null)?.zoho_estimate_id ?? "").trim();
  return estimateId || undefined;
}

/**
 * Creates or updates Zoho Books estimate/invoice for a sales document.
 *
 * When `opts.markSent` is set (the document is being emailed to the customer),
 * the linked Zoho estimate/invoice is also moved out of Zoho draft into "sent"
 * so Zoho mirrors Shalean's status. Documents that are never sent stay draft.
 */
export async function syncSalesDocumentToZoho(
  admin: SupabaseClient,
  documentId: string,
  opts?: { paymentUrl?: string | null; markSent?: boolean },
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

    let estimateId = linked;

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
      await admin
        .from("sales_documents")
        .update({ zoho_estimate_number: upd.estimateNumber })
        .eq("id", documentId);
    } else if (!linked) {
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
      estimateId = created.zohoEstimateId;
      await admin
        .from("sales_documents")
        .update({
          zoho_estimate_id: created.zohoEstimateId,
          zoho_estimate_number: created.estimateNumber,
        })
        .eq("id", documentId);
    }

    if (opts?.markSent && estimateId) {
      // Non-fatal: Zoho rejects marking already-sent/invoiced estimates.
      await markZohoEstimateSent(estimateId);
    }
    return { ok: true };
  }

  const linkedInv = String(row.zoho_invoice_id ?? "").trim();
  let invoiceId = linkedInv;

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
    await admin
      .from("sales_documents")
      .update({ zoho_invoice_number: upd.invoiceNumber })
      .eq("id", documentId);
  } else if (!linkedInv) {
    const invoicedEstimateId = await resolveSourceZohoEstimateId(admin, row.converted_from_id);
    const created = await createZohoInvoice({
      referenceId: row.id,
      orderKind: "sales",
      ...contact,
      lineItems: zohoLineItems,
      invoiceDate,
      dueDate,
      notes,
      currencyCode: row.currency,
      invoicedEstimateId,
    });
    if (!created.ok) return { ok: false, error: created.error };
    invoiceId = created.zohoInvoiceId;
    await admin
      .from("sales_documents")
      .update({
        zoho_invoice_id: created.zohoInvoiceId,
        zoho_invoice_number: created.invoiceNumber,
      })
      .eq("id", documentId);
  }

  if (opts?.markSent && invoiceId) {
    // Non-fatal: Zoho rejects marking already-sent/paid invoices.
    await markZohoInvoiceSent(invoiceId);
  }

  return { ok: true };
}
