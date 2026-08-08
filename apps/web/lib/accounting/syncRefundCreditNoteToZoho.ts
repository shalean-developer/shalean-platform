import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getZohoInvoice } from "@/lib/zoho/zohoBooksService";
import { zohoBooksClient } from "@/lib/zoho/zohoBooksClient";

type CreditNoteCreateResponse = {
  creditnote: {
    creditnote_id: string;
    creditnote_number?: string;
  };
};

async function resolveZohoInvoiceId(
  admin: SupabaseClient,
  entityType: string,
  entityId: string,
): Promise<string | null> {
  const table =
    entityType === "booking"
      ? "bookings"
      : entityType === "monthly_invoice"
        ? "monthly_invoices"
        : entityType === "sales_document"
          ? "sales_documents"
          : null;
  if (!table) return null;

  const { data } = await admin
    .from(table)
    .select("zoho_invoice_id")
    .eq("id", entityId)
    .maybeSingle();
  return data?.zoho_invoice_id?.trim() || null;
}

export async function syncRefundCreditNoteToZoho(
  admin: SupabaseClient,
  refundAccountingId: string,
): Promise<{ ok: true; externalId: string } | { ok: false; error: string }> {
  const { data: row, error } = await admin
    .from("refund_accounting_records")
    .select(
      "id, entity_type, entity_id, amount_cents, currency_code, refunded_at, reason, refund_reference, zoho_invoice_id, zoho_credit_note_id",
    )
    .eq("id", refundAccountingId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: "refund_accounting_record_not_found" };
  if (row.zoho_credit_note_id) return { ok: true, externalId: String(row.zoho_credit_note_id) };

  const zohoInvoiceId =
    row.zoho_invoice_id?.trim() ||
    (await resolveZohoInvoiceId(admin, String(row.entity_type), String(row.entity_id)));
  if (!zohoInvoiceId) {
    await admin
      .from("refund_accounting_records")
      .update({ accounting_status: "not_applicable", accounting_error: "no_zoho_invoice", updated_at: new Date().toISOString() })
      .eq("id", refundAccountingId);
    return { ok: true, externalId: "not_applicable:no_zoho_invoice" };
  }

  const invoice = await getZohoInvoice(zohoInvoiceId);
  if (!invoice.ok) return { ok: false, error: invoice.error };
  if (!invoice.customerId) return { ok: false, error: "zoho_invoice_missing_customer" };

  const amountCents = Math.max(0, Math.round(Number(row.amount_cents ?? 0)));
  if (amountCents <= 0) return { ok: false, error: "invalid_refund_amount" };

  const date = String(row.refunded_at ?? new Date().toISOString()).slice(0, 10);
  const reference = String(row.refund_reference ?? refundAccountingId).slice(0, 100);
  const description = String(row.reason ?? "Shalean customer refund").slice(0, 500);

  try {
    const created = await zohoBooksClient.post<CreditNoteCreateResponse>(
      `/creditnotes?invoice_id=${encodeURIComponent(zohoInvoiceId)}`,
      {
        customer_id: invoice.customerId,
        date,
        reference_number: reference,
        notes: `Shalean refund ${refundAccountingId}`,
        line_items: [
          {
            invoice_id: zohoInvoiceId,
            name: "Customer refund",
            description,
            quantity: 1,
            rate: amountCents / 100,
            product_type: "service",
          },
        ],
      },
    );

    const creditNoteId = created.creditnote?.creditnote_id?.trim();
    if (!creditNoteId) return { ok: false, error: "zoho_credit_note_missing_id" };

    const now = new Date().toISOString();
    await admin
      .from("refund_accounting_records")
      .update({
        zoho_invoice_id: zohoInvoiceId,
        zoho_credit_note_id: creditNoteId,
        zoho_credit_note_number: created.creditnote.creditnote_number ?? null,
        accounting_status: "synced",
        accounting_error: null,
        accounting_synced_at: now,
        updated_at: now,
      })
      .eq("id", refundAccountingId);

    return { ok: true, externalId: creditNoteId };
  } catch (err) {
    const message = String(err instanceof Error ? err.message : err);
    await admin
      .from("refund_accounting_records")
      .update({ accounting_status: "failed", accounting_error: message.slice(0, 2000), updated_at: new Date().toISOString() })
      .eq("id", refundAccountingId);
    return { ok: false, error: message };
  }
}
