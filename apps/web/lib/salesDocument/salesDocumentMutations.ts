import "server-only";

import { randomUUID } from "node:crypto";

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
import { recordSalesQuoteAcceptanceSnapshot } from "@/lib/salesDocument/recordSalesQuoteAcceptanceSnapshot";
import { markQuoteOpportunityWon } from "@/lib/salesDocument/salesOpportunityLifecycle";

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
  /** Internal conversion option: delay Zoho creation until booking creation succeeds. */
  sync_zoho?: boolean;
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
  if (input.sync_zoho !== false) {
    await syncSalesDocumentToZoho(admin, id);
  }
  return { ok: true, id };
}

export type SalesDocumentDraftPatch = {
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string | null;
  line_items?: SalesDocumentLineItem[];
  due_date?: string | null;
  notes?: string | null;
  customer_id?: string | null;
};

async function findLinkedUnpaidInvoiceId(
  admin: SupabaseClient,
  quoteId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("sales_documents")
    .select("id, status, document_type, amount_paid_cents")
    .eq("converted_from_id", quoteId)
    .eq("document_type", "invoice")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as {
    id: string;
    status: string;
    document_type: SalesDocumentType;
    amount_paid_cents: number | null;
  };

  if (
    !salesDocumentIsEditableWithoutPayment({
      document_type: row.document_type,
      status: row.status,
      amount_paid_cents: row.amount_paid_cents ?? 0,
    })
  ) {
    return null;
  }

  return String(row.id);
}

async function applySalesDocumentDraftPatch(
  admin: SupabaseClient,
  documentId: string,
  patch: SalesDocumentDraftPatch,
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

  if (Object.keys(updates).length === 0) return { ok: true };

  const { error: updErr } = await admin.from("sales_documents").update(updates).eq("id", documentId);
  if (updErr) return { ok: false, error: updErr.message };

  const nextStatus = updates.status === "draft" ? "draft" : currentStatus;
  const nextTotal = typeof updates.total_cents === "number" ? updates.total_cents : undefined;
  if (nextStatus !== "requested" && (nextTotal === undefined || nextTotal > 0)) {
    await syncSalesDocumentToZoho(admin, documentId);
  }
  return { ok: true };
}

export async function updateSalesDocumentDraft(
  admin: SupabaseClient,
  documentId: string,
  patch: SalesDocumentDraftPatch,
): Promise<{ ok: true; linked_invoice_id?: string | null } | { ok: false; error: string }> {
  const { data: existing, error: loadErr } = await admin
    .from("sales_documents")
    .select("id, document_type")
    .eq("id", documentId)
    .maybeSingle();

  if (loadErr) return { ok: false, error: loadErr.message };
  if (!existing) return { ok: false, error: "document_not_found" };

  const result = await applySalesDocumentDraftPatch(admin, documentId, patch);
  if (!result.ok) return result;

  let linkedInvoiceId: string | null = null;
  if (String((existing as { document_type: string }).document_type) === "quote") {
    linkedInvoiceId = await findLinkedUnpaidInvoiceId(admin, documentId);
    if (linkedInvoiceId) {
      const linkedResult = await applySalesDocumentDraftPatch(admin, linkedInvoiceId, patch);
      if (!linkedResult.ok) return linkedResult;
    }
  }

  return { ok: true, linked_invoice_id: linkedInvoiceId };
}

type ExistingConvertedInvoice = {
  id: string;
  zoho_invoice_id: string | null;
};

type ConversionLeaseClaimRow = {
  claimed?: boolean | null;
  lease_until?: string | null;
};

async function loadExistingConvertedInvoice(
  admin: SupabaseClient,
  quoteId: string,
): Promise<{ row: ExistingConvertedInvoice | null; error: string | null }> {
  const { data, error } = await admin
    .from("sales_documents")
    .select("id, zoho_invoice_id")
    .eq("converted_from_id", quoteId)
    .eq("document_type", "invoice")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { row: null, error: error.message };
  if (!data?.id) return { row: null, error: null };
  return {
    row: {
      id: String(data.id),
      zoho_invoice_id:
        typeof (data as { zoho_invoice_id?: unknown }).zoho_invoice_id === "string"
          ? String((data as { zoho_invoice_id: string }).zoho_invoice_id)
          : null,
    },
    error: null,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireSalesDocumentConversionLease(
  admin: SupabaseClient,
  invoiceId: string,
  token: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // A second acceptance request should normally observe the first request's
  // release within a few seconds and then complete as an idempotent replay.
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const { data, error } = await admin.rpc("claim_sales_document_conversion", {
      p_invoice_id: invoiceId,
      p_token: token,
      p_lease_seconds: 180,
    });
    if (error) return { ok: false, error: error.message };

    const row = Array.isArray(data)
      ? (data[0] as ConversionLeaseClaimRow | undefined)
      : (data as ConversionLeaseClaimRow | null);
    if (row?.claimed === true) return { ok: true };

    await delay(200);
  }

  return { ok: false, error: "conversion_busy" };
}

async function releaseSalesDocumentConversionLease(
  admin: SupabaseClient,
  invoiceId: string,
  token: string,
): Promise<void> {
  await admin.rpc("release_sales_document_conversion", {
    p_invoice_id: invoiceId,
    p_token: token,
  });
}

async function compensateFailedConversion(
  admin: SupabaseClient,
  invoiceId: string,
  token: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await admin.rpc("compensate_failed_sales_document_conversion", {
    p_invoice_id: invoiceId,
    p_token: token,
  });
  if (error) return { ok: false, error: error.message };

  const result =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as { ok?: unknown; error?: unknown })
      : null;
  if (result?.ok === true) return { ok: true };
  return {
    ok: false,
    error:
      typeof result?.error === "string"
        ? result.error
        : "conversion_compensation_failed",
  };
}

async function acceptQuoteTransition(
  admin: SupabaseClient,
  quoteId: string,
): Promise<{ ok: true; acceptedNow: boolean } | { ok: false; error: string }> {
  const { data, error } = await admin
    .from("sales_documents")
    .update({ status: "accepted" })
    .eq("id", quoteId)
    .neq("status", "accepted")
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  return { ok: true, acceptedNow: Boolean(data?.id) };
}

export async function convertSalesQuoteToInvoice(
  admin: SupabaseClient,
  quoteId: string,
  createdBy: string | null,
): Promise<
  | { ok: true; invoiceId: string; acceptedNow: boolean }
  | { ok: false; error: string }
> {
  let existingLookup = await loadExistingConvertedInvoice(admin, quoteId);
  if (existingLookup.error) return { ok: false, error: existingLookup.error };

  let invoice = existingLookup.row;
  let createdHere = false;

  if (!invoice) {
    const { data: quote, error } = await admin
      .from("sales_documents")
      .select("*")
      .eq("id", quoteId)
      .maybeSingle();

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
      sync_zoho: false,
    });

    if (created.ok) {
      createdHere = true;
      invoice = { id: created.id, zoho_invoice_id: null };
    } else {
      // A concurrent request may have won the one-invoice-per-quote unique race.
      existingLookup = await loadExistingConvertedInvoice(admin, quoteId);
      if (existingLookup.error) return { ok: false, error: existingLookup.error };
      if (!existingLookup.row) return created;
      invoice = existingLookup.row;
    }
  }

  if (!invoice) return { ok: false, error: "invoice_not_found" };

  const invoiceId = invoice.id;
  const leaseToken = randomUUID();
  const lease = await acquireSalesDocumentConversionLease(admin, invoiceId, leaseToken);
  if (!lease.ok) return lease;

  try {
    // Re-read under the lease so Zoho linkage cannot be decided from stale state.
    const { data: leasedInvoice, error: leasedInvoiceErr } = await admin
      .from("sales_documents")
      .select("id, zoho_invoice_id")
      .eq("id", invoiceId)
      .maybeSingle();

    if (leasedInvoiceErr) return { ok: false, error: leasedInvoiceErr.message };
    if (!leasedInvoice) return { ok: false, error: "invoice_not_found" };

    const bookingResult = await createBookingFromSalesQuoteInvoice(admin, {
      quoteId,
      invoiceId,
    });

    if (!bookingResult.ok) {
      await logSystemEvent({
        level: "error",
        source: "sales_document/convert",
        message: "booking_create_failed_before_accept",
        context: { quoteId, invoiceId, error: bookingResult.error },
      });

      if (createdHere) {
        const compensation = await compensateFailedConversion(admin, invoiceId, leaseToken);
        if (!compensation.ok) {
          await logSystemEvent({
            level: "error",
            source: "sales_document/convert",
            message: "booking_create_failed_invoice_compensation_failed",
            context: {
              quoteId,
              invoiceId,
              bookingError: bookingResult.error,
              compensationError: compensation.error,
            },
          });
          return {
            ok: false,
            error:
              `booking_create_failed:${bookingResult.error}:invoice_compensation_failed:${compensation.error}`,
          };
        }
      }

      return { ok: false, error: `booking_create_failed:${bookingResult.error}` };
    }

    const existingZohoInvoiceId = String(
      (leasedInvoice as { zoho_invoice_id?: string | null }).zoho_invoice_id ?? "",
    ).trim();

    if (!existingZohoInvoiceId) {
      // Renew immediately before the external call so the lease cannot expire
      // during a normal Zoho request.
      const renewed = await acquireSalesDocumentConversionLease(admin, invoiceId, leaseToken);
      if (!renewed.ok) return renewed;

      const zohoSync = await syncSalesDocumentToZoho(admin, invoiceId);
      if (!zohoSync.ok) {
        await logSystemEvent({
          level: "error",
          source: "sales_document/convert",
          message: "zoho_sync_failed_before_accept",
          context: { quoteId, invoiceId, error: zohoSync.error },
        });
        return { ok: false, error: `zoho_sync_failed:${zohoSync.error}` };
      }
    }

    const snapshot = await recordSalesQuoteAcceptanceSnapshot(admin, {
      quoteId,
      invoiceId,
    });
    if (!snapshot.ok) return snapshot;

    const accepted = await acceptQuoteTransition(admin, quoteId);
    if (!accepted.ok) return accepted;

    if (accepted.acceptedNow) {
      await markQuoteOpportunityWon(admin, quoteId, "quote_accepted");
    }

    return {
      ok: true,
      invoiceId,
      acceptedNow: accepted.acceptedNow,
    };
  } finally {
    await releaseSalesDocumentConversionLease(admin, invoiceId, leaseToken);
  }
}
