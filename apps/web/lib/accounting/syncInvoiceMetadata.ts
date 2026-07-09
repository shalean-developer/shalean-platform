import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getZohoInvoice } from "@/lib/zoho/zohoBooksService";

export type InvoiceEntityType = "booking" | "monthly_invoice" | "sales_document";

/**
 * Upsert invoice sync metadata after Zoho invoice creation or status poll.
 */
export async function upsertInvoiceSyncMetadata(
  admin: SupabaseClient,
  params: {
    entityType: InvoiceEntityType;
    entityId: string;
    zohoInvoiceId: string;
    zohoInvoiceNumber?: string | null;
    bookingId?: string | null;
    zohoCustomerId?: string | null;
    invoiceStatus?: string | null;
    invoiceTotalCents?: number | null;
    taxAmountCents?: number | null;
    outstandingBalanceCents?: number | null;
    syncStatus?: "synced" | "pending" | "failed";
    syncErrors?: string | null;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const row = {
    entity_type: params.entityType,
    entity_id: params.entityId,
    zoho_invoice_id: params.zohoInvoiceId,
    zoho_invoice_number: params.zohoInvoiceNumber ?? null,
    zoho_customer_id: params.zohoCustomerId ?? null,
    booking_id: params.bookingId ?? (params.entityType === "booking" ? params.entityId : null),
    invoice_status: params.invoiceStatus ?? null,
    invoice_total_cents: params.invoiceTotalCents ?? null,
    tax_amount_cents: params.taxAmountCents ?? null,
    outstanding_balance_cents: params.outstandingBalanceCents ?? null,
    sync_status: params.syncStatus ?? "synced",
    sync_errors: params.syncErrors ?? null,
    last_synced_at: now,
    updated_at: now,
  };

  await admin.from("accounting_invoice_sync").upsert(row, {
    onConflict: "entity_type,entity_id",
  });
}

/**
 * Poll Zoho for current invoice status and update local metadata.
 */
export async function refreshInvoiceStatusFromZoho(
  admin: SupabaseClient,
  entityType: InvoiceEntityType,
  entityId: string,
  zohoInvoiceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await getZohoInvoice(zohoInvoiceId);
  if (!res.ok) return { ok: false, error: res.error };

  await upsertInvoiceSyncMetadata(admin, {
    entityType,
    entityId,
    zohoInvoiceId: res.zohoInvoiceId,
    zohoInvoiceNumber: res.invoiceNumber,
    zohoCustomerId: res.customerId,
    invoiceStatus: res.status,
    invoiceTotalCents: res.totalCents,
    taxAmountCents: res.taxCents,
    outstandingBalanceCents: res.balanceCents,
    syncStatus: "synced",
  });

  return { ok: true };
}

/**
 * Sync all invoices with Zoho IDs that haven't been refreshed recently.
 */
export async function syncInvoiceStatusesFromZoho(
  admin: SupabaseClient,
  limit = 50,
): Promise<{ synced: number; failed: number }> {
  const { data: bookings } = await admin
    .from("bookings")
    .select("id, zoho_invoice_id")
    .not("zoho_invoice_id", "is", null)
    .limit(limit);

  let synced = 0;
  let failed = 0;

  for (const b of bookings ?? []) {
    if (!b.zoho_invoice_id) continue;
    const result = await refreshInvoiceStatusFromZoho(admin, "booking", b.id, b.zoho_invoice_id);
    if (result.ok) synced++;
    else failed++;
  }

  const { data: invoices } = await admin
    .from("monthly_invoices")
    .select("id, zoho_invoice_id")
    .not("zoho_invoice_id", "is", null)
    .limit(limit);

  for (const inv of invoices ?? []) {
    if (!inv.zoho_invoice_id) continue;
    const result = await refreshInvoiceStatusFromZoho(
      admin,
      "monthly_invoice",
      inv.id,
      inv.zoho_invoice_id,
    );
    if (result.ok) synced++;
    else failed++;
  }

  const { data: salesDocs } = await admin
    .from("sales_documents")
    .select("id, zoho_invoice_id")
    .not("zoho_invoice_id", "is", null)
    .limit(limit);

  for (const sd of salesDocs ?? []) {
    if (!sd.zoho_invoice_id) continue;
    const result = await refreshInvoiceStatusFromZoho(
      admin,
      "sales_document",
      sd.id,
      sd.zoho_invoice_id,
    );
    if (result.ok) synced++;
    else failed++;
  }

  return { synced, failed };
}
