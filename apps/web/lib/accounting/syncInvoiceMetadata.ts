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
    syncStatus?: "synced" | "pending" | "failed" | "ignored";
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

  const { error } = await admin.from("accounting_invoice_sync").upsert(row, {
    onConflict: "entity_type,entity_id",
  });
  if (error) throw new Error(`invoice_sync_metadata_upsert_failed: ${error.message}`);
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

  try {
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
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  return { ok: true };
}

/**
 * Sync all invoices with Zoho IDs that haven't been refreshed recently.
 */
export async function syncInvoiceStatusesFromZoho(
  admin: SupabaseClient,
  limit = 50,
): Promise<{ synced: number; failed: number }> {
  // Rotate a bounded page over all linked records. This advances even if the
  // earliest records repeatedly fail, without falsifying last_synced_at.
  const batchSize = Math.max(0, Math.floor(limit));
  if (batchSize === 0) return { synced: 0, failed: 0 };
  const baseQuery = () => admin
    .from("accounting_invoice_sync")
    .select("entity_type, entity_id, zoho_invoice_id")
    .or("sync_status.is.null,sync_status.neq.ignored")
    .not("zoho_invoice_id", "is", null)
    .order("id", { ascending: true });
  const { count, error: countError } = await admin
    .from("accounting_invoice_sync")
    .select("id", { count: "exact", head: true })
    .or("sync_status.is.null,sync_status.neq.ignored")
    .not("zoho_invoice_id", "is", null);
  if (countError) throw new Error(`invoice_status_count_failed: ${countError.message}`);
  const total = count ?? 0;
  if (total === 0) return { synced: 0, failed: 0 };
  const pageCount = Math.ceil(total / batchSize);
  // One page per 15-minute slot. A failed page cannot monopolize the next slot.
  const page = Math.floor(Date.now() / 900000) % pageCount;
  const offset = page * batchSize;
  const { data, error } = await baseQuery().range(offset, offset + batchSize - 1);
  if (error) throw new Error(`invoice_status_candidate_query_failed: ${error.message}`);

  let synced = 0;
  let failed = 0;
  for (const row of data ?? []) {
    if (
      row.entity_type !== "booking" &&
      row.entity_type !== "monthly_invoice" &&
      row.entity_type !== "sales_document"
    ) continue;
    if (!row.entity_id || !row.zoho_invoice_id) continue;
    const result = await refreshInvoiceStatusFromZoho(
      admin,
      row.entity_type,
      row.entity_id,
      row.zoho_invoice_id,
    );
    if (result.ok) synced++;
    else failed++;
  }
  return { synced, failed };
}
