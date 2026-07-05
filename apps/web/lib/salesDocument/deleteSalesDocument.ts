import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logSystemEvent } from "@/lib/logging/systemLog";
import {
  salesDocumentIsDeletable,
  type SalesDocumentType,
} from "@/lib/salesDocument/types";
import { deleteZohoEstimate, voidZohoInvoice } from "@/lib/zoho/zohoBooksService";

type SalesDocumentRow = {
  id: string;
  document_type: SalesDocumentType;
  status: string;
  amount_paid_cents: number | null;
  converted_from_id: string | null;
  zoho_estimate_id: string | null;
  zoho_invoice_id: string | null;
  customer_name: string;
};

export type DeleteSalesDocumentResult =
  | { ok: true; deleted_ids: string[] }
  | { ok: false; error: string };

async function loadSalesDocumentRow(
  admin: SupabaseClient,
  documentId: string,
): Promise<SalesDocumentRow | null> {
  const { data, error } = await admin
    .from("sales_documents")
    .select(
      "id, document_type, status, amount_paid_cents, converted_from_id, zoho_estimate_id, zoho_invoice_id, customer_name",
    )
    .eq("id", documentId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return data as SalesDocumentRow;
}

async function findLinkedInvoiceIds(admin: SupabaseClient, quoteId: string): Promise<string[]> {
  const { data, error } = await admin
    .from("sales_documents")
    .select("id")
    .eq("converted_from_id", quoteId)
    .eq("document_type", "invoice");

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => String((row as { id: string }).id));
}

async function removeLinkedUnpaidBooking(
  admin: SupabaseClient,
  invoiceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await admin
    .from("bookings")
    .select("id, payment_completed_at, amount_paid_cents")
    .eq("sales_document_id", invoiceId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data?.id) return { ok: true };

  const row = data as {
    id: string;
    payment_completed_at?: string | null;
    amount_paid_cents?: number | null;
  };

  if (row.payment_completed_at || Math.max(0, Math.round(Number(row.amount_paid_cents ?? 0))) > 0) {
    return { ok: false, error: "linked_paid_booking" };
  }

  const { error: delErr } = await admin.from("bookings").delete().eq("id", row.id);
  if (delErr) return { ok: false, error: delErr.message };
  return { ok: true };
}

async function syncZohoRemoval(row: SalesDocumentRow): Promise<void> {
  if (row.document_type === "quote") {
    const estimateId = String(row.zoho_estimate_id ?? "").trim();
    if (!estimateId) return;
    const res = await deleteZohoEstimate(estimateId);
    if (!res.ok) {
      await logSystemEvent({
        level: "warn",
        source: "sales_document/delete",
        message: "zoho_estimate_delete_failed",
        context: { documentId: row.id, estimateId, error: res.error },
      });
    }
    return;
  }

  const invoiceId = String(row.zoho_invoice_id ?? "").trim();
  if (!invoiceId) return;
  const res = await voidZohoInvoice(invoiceId);
  if (!res.ok) {
    await logSystemEvent({
      level: "warn",
      source: "sales_document/delete",
      message: "zoho_invoice_void_failed",
      context: { documentId: row.id, zohoInvoiceId: invoiceId, error: res.error },
    });
  }
}

async function resetQuoteAfterInvoiceDelete(admin: SupabaseClient, quoteId: string): Promise<void> {
  await admin
    .from("sales_documents")
    .update({ status: "sent" })
    .eq("id", quoteId)
    .eq("status", "accepted");
}

async function deleteSalesDocumentInternal(
  admin: SupabaseClient,
  documentId: string,
  deletedIds: string[],
): Promise<DeleteSalesDocumentResult> {
  const row = await loadSalesDocumentRow(admin, documentId);
  if (!row) return { ok: false, error: "document_not_found" };

  if (
    !salesDocumentIsDeletable({
      document_type: row.document_type,
      status: row.status,
      amount_paid_cents: row.amount_paid_cents ?? 0,
    })
  ) {
    return { ok: false, error: "not_deletable" };
  }

  if (row.document_type === "quote") {
    const linkedInvoiceIds = await findLinkedInvoiceIds(admin, row.id);
    for (const invoiceId of linkedInvoiceIds) {
      const nested = await deleteSalesDocumentInternal(admin, invoiceId, deletedIds);
      if (!nested.ok) return nested;
    }
  }

  if (row.document_type === "invoice") {
    const bookingResult = await removeLinkedUnpaidBooking(admin, row.id);
    if (!bookingResult.ok) return bookingResult;

    const quoteId = String(row.converted_from_id ?? "").trim();
    if (quoteId) {
      await resetQuoteAfterInvoiceDelete(admin, quoteId);
    }
  }

  await syncZohoRemoval(row);

  const { error: delErr } = await admin.from("sales_documents").delete().eq("id", row.id);
  if (delErr) return { ok: false, error: delErr.message };

  deletedIds.push(row.id);

  await logSystemEvent({
    level: "info",
    source: "sales_document/delete",
    message: "sales_document.deleted",
    context: {
      documentId: row.id,
      documentType: row.document_type,
      customerName: row.customer_name,
    },
  });

  return { ok: true, deleted_ids: deletedIds };
}

export async function deleteSalesDocument(
  admin: SupabaseClient,
  documentId: string,
): Promise<DeleteSalesDocumentResult> {
  const result = await deleteSalesDocumentInternal(admin, documentId, []);
  if (!result.ok) return result;
  return { ok: true, deleted_ids: result.deleted_ids };
}
