import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  computeSalesDocumentTotals,
  parseSalesDocumentLineItems,
  salesDocumentIsEditableWithoutPayment,
  type SalesDocumentLineItem,
  type SalesDocumentType,
} from "@/lib/salesDocument/types";
import { createBookingFromSalesQuoteInvoice } from "@/lib/salesDocument/createBookingFromSalesQuoteInvoice";
import { ensureSalesDocumentCustomer } from "@/lib/salesDocument/ensureSalesDocumentCustomer";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { syncSalesDocumentToZoho } from "@/lib/salesDocument/syncSalesDocumentToZoho";

export type CreateSalesDocumentInput = {
  document_type: SalesDocumentType;
  customer_id?: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone?: string | null;
  line_items: SalesDocumentLineItem[];
  due_date?: string | null;
  notes?: string | null;
  created_by?: string | null;
  converted_from_id?: string | null;
};

export async function createSalesDocument(
  admin: SupabaseClient,
  input: CreateSalesDocumentInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const lineItems = parseSalesDocumentLineItems(input.line_items);
  if (lineItems.length === 0) return { ok: false, error: "line_items_required" };

  const { subtotal_cents, total_cents } = computeSalesDocumentTotals(lineItems);
  const email = input.customer_email.trim().toLowerCase();
  if (!email) return { ok: false, error: "customer_email_required" };
  const name = input.customer_name.trim();
  if (name.length < 2) return { ok: false, error: "customer_name_required" };

  const { data, error } = await admin
    .from("sales_documents")
    .insert({
      document_type: input.document_type,
      status: "draft",
      customer_id: input.customer_id ?? null,
      customer_name: name,
      customer_email: email,
      customer_phone: input.customer_phone?.trim() || null,
      line_items: lineItems,
      subtotal_cents,
      total_cents,
      balance_cents: input.document_type === "invoice" ? total_cents : 0,
      amount_paid_cents: 0,
      due_date: input.due_date?.slice(0, 10) || null,
      notes: input.notes?.trim() || null,
      created_by: input.created_by ?? null,
      converted_from_id: input.converted_from_id ?? null,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "insert_failed" };

  const id = String((data as { id: string }).id);
  await syncSalesDocumentToZoho(admin, id);
  return { ok: true, id };
}

export async function updateSalesDocumentDraft(
  admin: SupabaseClient,
  documentId: string,
  patch: {
    customer_name?: string;
    customer_email?: string;
    customer_phone?: string | null;
    line_items?: SalesDocumentLineItem[];
    due_date?: string | null;
    notes?: string | null;
    customer_id?: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: existing, error: loadErr } = await admin
    .from("sales_documents")
    .select("id, status, document_type, amount_paid_cents")
    .eq("id", documentId)
    .maybeSingle();

  if (loadErr) return { ok: false, error: loadErr.message };
  if (!existing) return { ok: false, error: "document_not_found" };

  const row = existing as {
    status: string;
    document_type: SalesDocumentType;
    amount_paid_cents: number | null;
  };
  const currentStatus = String(row.status);
  if (
    !salesDocumentIsEditableWithoutPayment({
      document_type: row.document_type,
      status: currentStatus,
      amount_paid_cents: row.amount_paid_cents ?? 0,
    })
  ) {
    return { ok: false, error: "not_editable" };
  }
  const updates: Record<string, unknown> = {};

  if (patch.customer_name) updates.customer_name = patch.customer_name.trim();
  if (patch.customer_email) updates.customer_email = patch.customer_email.trim().toLowerCase();
  if (patch.customer_phone !== undefined) updates.customer_phone = patch.customer_phone?.trim() || null;
  if (patch.customer_id !== undefined) updates.customer_id = patch.customer_id;
  if (patch.due_date !== undefined) updates.due_date = patch.due_date?.slice(0, 10) || null;
  if (patch.notes !== undefined) updates.notes = patch.notes?.trim() || null;

  if (patch.line_items) {
    const lineItems = parseSalesDocumentLineItems(patch.line_items);
    if (lineItems.length === 0) return { ok: false, error: "line_items_required" };
    const totals = computeSalesDocumentTotals(lineItems);
    updates.line_items = lineItems;
    updates.subtotal_cents = totals.subtotal_cents;
    updates.total_cents = totals.total_cents;
    if (row.document_type === "invoice") {
      updates.balance_cents = totals.total_cents;
      if (currentStatus !== "draft" && currentStatus !== "requested") {
        updates.payment_link = null;
        updates.payment_link_expires_at = null;
      }
    }
    if (currentStatus === "requested" && totals.total_cents > 0) {
      updates.status = "draft";
    }
  }

  const { error: updErr } = await admin.from("sales_documents").update(updates).eq("id", documentId);
  if (updErr) return { ok: false, error: updErr.message };

  const nextStatus =
    updates.status === "draft" ? "draft" : currentStatus;
  const nextTotal =
    typeof updates.total_cents === "number" ? updates.total_cents : undefined;
  if (nextStatus !== "requested" && (nextTotal === undefined || nextTotal > 0)) {
    await syncSalesDocumentToZoho(admin, documentId);
  }
  return { ok: true };
}

export async function convertSalesQuoteToInvoice(
  admin: SupabaseClient,
  quoteId: string,
  createdBy: string | null,
): Promise<{ ok: true; invoiceId: string } | { ok: false; error: string }> {
  const { data: existingInvoice, error: existingLookupErr } = await admin
    .from("sales_documents")
    .select("id")
    .eq("converted_from_id", quoteId)
    .eq("document_type", "invoice")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingLookupErr) return { ok: false, error: existingLookupErr.message };
  if (existingInvoice?.id) {
    await admin.from("sales_documents").update({ status: "accepted" }).eq("id", quoteId);
    const invoiceId = String(existingInvoice.id);
    const bookingResult = await createBookingFromSalesQuoteInvoice(admin, { quoteId, invoiceId });
    if (!bookingResult.ok) {
      await logSystemEvent({
        level: "warn",
        source: "sales_document/convert",
        message: "booking_create_failed",
        context: { quoteId, invoiceId, error: bookingResult.error },
      });
    }
    return { ok: true, invoiceId };
  }

  const { data: quote, error } = await admin.from("sales_documents").select("*").eq("id", quoteId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!quote) return { ok: false, error: "quote_not_found" };

  const q = quote as {
    document_type: string;
    status: string;
    customer_id: string | null;
    customer_name: string;
    customer_email: string;
    customer_phone: string | null;
    line_items: unknown;
    subtotal_cents: number;
    total_cents: number;
    currency: string;
    due_date: string | null;
    notes: string | null;
    created_by: string | null;
  };

  if (q.document_type !== "quote") return { ok: false, error: "not_a_quote" };
  if (["void", "expired", "paid"].includes(String(q.status))) {
    return { ok: false, error: "quote_not_convertible" };
  }

  if (!q.customer_id) {
    const ensured = await ensureSalesDocumentCustomer(admin, quoteId);
    if (ensured.ok) {
      q.customer_id = ensured.customerId;
    } else {
      await logSystemEvent({
        level: "warn",
        source: "sales_document/convert",
        message: "customer_ensure_failed",
        context: { quoteId, error: ensured.error },
      });
    }
  }

  const created = await createSalesDocument(admin, {
    document_type: "invoice",
    customer_id: q.customer_id,
    customer_name: q.customer_name,
    customer_email: q.customer_email,
    customer_phone: q.customer_phone,
    line_items: parseSalesDocumentLineItems(q.line_items),
    due_date: q.due_date,
    notes: q.notes,
    created_by: createdBy ?? q.created_by,
    converted_from_id: quoteId,
  });

  if (!created.ok) return created;

  await admin.from("sales_documents").update({ status: "accepted" }).eq("id", quoteId);

  const bookingResult = await createBookingFromSalesQuoteInvoice(admin, {
    quoteId,
    invoiceId: created.id,
  });
  if (!bookingResult.ok) {
    await logSystemEvent({
      level: "warn",
      source: "sales_document/convert",
      message: "booking_create_failed",
      context: { quoteId, invoiceId: created.id, error: bookingResult.error },
    });
  }

  return { ok: true, invoiceId: created.id };
}
