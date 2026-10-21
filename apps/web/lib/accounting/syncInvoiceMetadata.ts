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
  const batchSize = Math.max(0, Math.floor(limit));
  if (batchSize === 0) return { synced: 0, failed: 0 };

  // The caller holds the accounting cron lease. Persist position independently
  // of cadence; a missed invocation must not skip or repeat a page forever.
  const { data: cursor, error: cursorError } = await admin
    .from("accounting_invoice_refresh_cursor")
    .select("last_id")
    .eq("name", "zoho_invoice_status")
    .single();
  if (cursorError || !cursor) throw new Error(`invoice_refresh_cursor_read_failed: ${cursorError?.message ?? "missing row"}`);

  const candidates = () => admin
    .from("accounting_invoice_sync")
    .select("id, entity_type, entity_id, zoho_invoice_id")
    .or("sync_status.is.null,sync_status.neq.ignored")
    .not("zoho_invoice_id", "is", null)
    .order("id", { ascending: true })
    .limit(batchSize);

  let selected = await candidates().gt("id", cursor.last_id);
  if (selected.error) throw new Error(`invoice_refresh_candidates_failed: ${selected.error.message}`);
  if (!selected.data?.length) {
    selected = await candidates();
    if (selected.error) throw new Error(`invoice_refresh_wrap_failed: ${selected.error.message}`);
  }
  const data = selected.data ?? [];
  // Advance even if Zoho is unavailable. The next cycle will revisit failures,
  // while every other invoice remains reachable.
  if (data.length) {
    const { error: advanceError } = await admin
      .from("accounting_invoice_refresh_cursor")
      .update({ last_id: data[data.length - 1].id, updated_at: new Date().toISOString() })
      .eq("name", "zoho_invoice_status");
    if (advanceError) throw new Error(`invoice_refresh_cursor_advance_failed: ${advanceError.message}`);
  }

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
