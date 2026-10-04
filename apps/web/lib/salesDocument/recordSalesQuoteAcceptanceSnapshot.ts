import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { parseSalesDocumentLineItems } from "@/lib/salesDocument/types";

export type RecordSalesQuoteAcceptanceResult =
  | { ok: true; snapshotId: string; alreadyExisted: boolean }
  | { ok: false; error: string };

export async function recordSalesQuoteAcceptanceSnapshot(
  admin: SupabaseClient,
  params: { quoteId: string; invoiceId: string },
): Promise<RecordSalesQuoteAcceptanceResult> {
  const { data: existing, error: existingErr } = await admin
    .from("sales_quote_acceptance_snapshots")
    .select("id, quote_id, invoice_id")
    .eq("quote_id", params.quoteId)
    .maybeSingle();

  if (existingErr) return { ok: false, error: existingErr.message };
  if (existing?.id) {
    if (String(existing.invoice_id) !== params.invoiceId) {
      return { ok: false, error: "acceptance_snapshot_invoice_mismatch" };
    }
    return { ok: true, snapshotId: String(existing.id), alreadyExisted: true };
  }

  const { data: quote, error: quoteErr } = await admin
    .from("sales_documents")
    .select(
      "id, document_type, status, customer_id, customer_name, customer_email, customer_phone, line_items, subtotal_cents, total_cents, currency, due_date, notes, source, request_details, updated_at",
    )
    .eq("id", params.quoteId)
    .maybeSingle();

  if (quoteErr) return { ok: false, error: quoteErr.message };
  if (!quote) return { ok: false, error: "quote_not_found" };
  if (String(quote.document_type) !== "quote") return { ok: false, error: "not_a_quote" };

  const statusBefore = String(quote.status ?? "").toLowerCase();
  if (statusBefore === "accepted") {
    return { ok: false, error: "legacy_accepted_quote_missing_snapshot" };
  }
  if (["void", "expired", "paid", "refunded"].includes(statusBefore)) {
    return { ok: false, error: "quote_not_acceptance_snapshot_eligible" };
  }

  const lineItems = parseSalesDocumentLineItems(quote.line_items);
  if (lineItems.length === 0) return { ok: false, error: "acceptance_snapshot_line_items_required" };

  const { data: invoice, error: invoiceErr } = await admin
    .from("sales_documents")
    .select("id, document_type, converted_from_id")
    .eq("id", params.invoiceId)
    .maybeSingle();

  if (invoiceErr) return { ok: false, error: invoiceErr.message };
  if (!invoice) return { ok: false, error: "invoice_not_found" };
  if (String(invoice.document_type) !== "invoice") return { ok: false, error: "acceptance_snapshot_target_not_invoice" };
  if (String(invoice.converted_from_id ?? "") !== params.quoteId) {
    return { ok: false, error: "acceptance_snapshot_invoice_not_from_quote" };
  }

  const { data: inserted, error: insertErr } = await admin
    .from("sales_quote_acceptance_snapshots")
    .insert({
      quote_id: params.quoteId,
      invoice_id: params.invoiceId,
      snapshot_schema_version: 1,
      source_quote_updated_at: quote.updated_at,
      quote_status_before: statusBefore,
      customer_id: quote.customer_id ?? null,
      customer_name: String(quote.customer_name ?? ""),
      customer_email: String(quote.customer_email ?? "").trim().toLowerCase(),
      customer_phone: quote.customer_phone ? String(quote.customer_phone) : null,
      line_items: lineItems,
      subtotal_cents: Math.max(0, Math.round(Number(quote.subtotal_cents ?? 0))),
      total_cents: Math.max(0, Math.round(Number(quote.total_cents ?? 0))),
      currency: String(quote.currency ?? "ZAR"),
      due_date: quote.due_date ?? null,
      notes: quote.notes ?? null,
      source: quote.source ?? null,
      request_details: quote.request_details ?? null,
    })
    .select("id")
    .single();

  if (insertErr || !inserted?.id) {
    if (insertErr?.code === "23505") {
      const { data: raced } = await admin
        .from("sales_quote_acceptance_snapshots")
        .select("id, invoice_id")
        .eq("quote_id", params.quoteId)
        .maybeSingle();
      if (raced?.id && String(raced.invoice_id) === params.invoiceId) {
        return { ok: true, snapshotId: String(raced.id), alreadyExisted: true };
      }
    }
    return { ok: false, error: insertErr?.message ?? "acceptance_snapshot_insert_failed" };
  }

  await logSystemEvent({
    level: "info",
    source: "sales_document/quote_acceptance",
    message: "quote_acceptance_snapshot_recorded",
    context: {
      quote_id: params.quoteId,
      invoice_id: params.invoiceId,
      snapshot_id: String(inserted.id),
      total_cents: Math.max(0, Math.round(Number(quote.total_cents ?? 0))),
      quote_status_before: statusBefore,
    },
  });

  return { ok: true, snapshotId: String(inserted.id), alreadyExisted: false };
}
