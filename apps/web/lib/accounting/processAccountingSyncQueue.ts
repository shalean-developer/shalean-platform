import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  markSyncFailed,
  markSyncSucceeded,
  computeNextRetryAt,
} from "@/lib/accounting/accountingSyncQueue";
import { syncExpenseToZoho } from "@/lib/accounting/syncExpenseToZoho";
import { syncVendorToZoho } from "@/lib/accounting/syncVendorToZoho";
import { syncRefundCreditNoteToZoho } from "@/lib/accounting/syncRefundCreditNoteToZoho";
import {
  isZohoConfigured,
  loadZohoIntegrationSettings,
} from "@/lib/accounting/zohoIntegrationSettings";
import { syncInvoiceStatusesFromZoho } from "@/lib/accounting/syncInvoiceMetadata";
import { markZohoInvoicePaid } from "@/lib/zoho/zohoBooksService";
import { logSystemEvent } from "@/lib/logging/systemLog";

type SyncRecord = {
  id: string;
  entity_type: string;
  entity_id: string;
  retry_count: number;
  sync_status: string;
  next_retry_at: string | null;
};

async function processPaymentTransactionSync(
  admin: SupabaseClient,
  entityId: string,
): Promise<{ ok: true; externalId?: string } | { ok: false; error: string }> {
  const { data: pt } = await admin
    .from("payment_transactions")
    .select(
      "id, gateway_reference, amount_cents, paid_at, entity_type, entity_id, external_accounting_id, sync_status",
    )
    .eq("id", entityId)
    .maybeSingle();

  if (!pt) return { ok: false, error: "payment_transaction_not_found" };
  if (pt.external_accounting_id && pt.sync_status === "synced") {
    return { ok: true, externalId: pt.external_accounting_id };
  }

  let zohoInvoiceId: string | null = null;
  let customerEmail: string | undefined;
  let customerName: string | undefined;

  if (pt.entity_type === "booking") {
    const { data: b } = await admin
      .from("bookings")
      .select("zoho_invoice_id, customer_email, customer_name")
      .eq("id", pt.entity_id)
      .maybeSingle();
    zohoInvoiceId = b?.zoho_invoice_id ?? null;
    customerEmail = b?.customer_email ?? undefined;
    customerName = b?.customer_name ?? undefined;
  } else if (pt.entity_type === "monthly_invoice") {
    const { data: inv } = await admin
      .from("monthly_invoices")
      .select("zoho_invoice_id, customer_id")
      .eq("id", pt.entity_id)
      .maybeSingle();
    zohoInvoiceId = inv?.zoho_invoice_id ?? null;
    if (inv?.customer_id) {
      const { data: profile } = await admin
        .from("user_profiles")
        .select("billing_email, full_name, email")
        .eq("id", inv.customer_id)
        .maybeSingle();
      customerEmail = profile?.billing_email ?? profile?.email ?? undefined;
      customerName = profile?.full_name ?? undefined;
    }
  } else if (pt.entity_type === "sales_document") {
    const { data: sd } = await admin
      .from("sales_documents")
      .select("zoho_invoice_id, customer_email, customer_name")
      .eq("id", pt.entity_id)
      .maybeSingle();
    zohoInvoiceId = sd?.zoho_invoice_id ?? null;
    customerEmail = sd?.customer_email ?? undefined;
    customerName = sd?.customer_name ?? undefined;
  }

  if (!zohoInvoiceId) return { ok: false, error: "no_zoho_invoice_for_payment" };

  const paidDate = pt.paid_at ? pt.paid_at.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const res = await markZohoInvoicePaid({
    zohoInvoiceId,
    amountZar: pt.amount_cents / 100,
    paymentDate: paidDate,
    reference: pt.gateway_reference,
    customerEmail,
    customerName,
  });

  if (!res.ok) return { ok: false, error: res.error };

  const now = new Date().toISOString();
  await admin
    .from("payment_transactions")
    .update({
      external_accounting_id: res.paymentId,
      sync_status: "synced",
      last_synced_at: now,
      sync_errors: null,
    })
    .eq("id", entityId);

  return { ok: true, externalId: res.paymentId };
}

async function processSyncRecord(
  admin: SupabaseClient,
  record: SyncRecord,
  settings: Awaited<ReturnType<typeof loadZohoIntegrationSettings>>,
): Promise<void> {
  let result: { ok: true; externalId?: string } | { ok: false; error: string };

  switch (record.entity_type) {
    case "expense":
      result = await syncExpenseToZoho(admin, record.entity_id);
      break;
    case "vendor":
      result = await syncVendorToZoho(admin, record.entity_id);
      break;
    case "payment_transaction":
      result = await processPaymentTransactionSync(admin, record.entity_id);
      break;
    case "refund":
      result = await syncRefundCreditNoteToZoho(admin, record.entity_id);
      break;
    default:
      result = { ok: false, error: `unsupported_entity_type:${record.entity_type}` };
  }

  if (result.ok) {
    await markSyncSucceeded(admin, record.id, result.externalId ?? null);
  } else {
    await markSyncFailed(
      admin,
      record.id,
      result.error,
      record.retry_count,
      settings.max_retry_attempts,
      settings.retry_base_delay_seconds,
    );
    await logSystemEvent({
      level: "warn",
      source: "accounting/processAccountingSyncQueue",
      message: "sync_failed",
      context: {
        entity_type: record.entity_type,
        entity_id: record.entity_id,
        error: result.error,
        retry_count: record.retry_count + 1,
      },
    });
  }
}

export type ProcessAccountingSyncResult = {
  processed: number;
  succeeded: number;
  failed: number;
  invoice_status_sync: { synced: number; failed: number };
};

/**
 * Process pending and due-for-retry accounting sync records.
 */
export async function processAccountingSyncQueue(
  admin: SupabaseClient,
  limit = 50,
): Promise<ProcessAccountingSyncResult> {
  if (!isZohoConfigured()) {
    return { processed: 0, succeeded: 0, failed: 0, invoice_status_sync: { synced: 0, failed: 0 } };
  }

  const settings = await loadZohoIntegrationSettings(admin);
  if (!settings.auto_sync_enabled) {
    return { processed: 0, succeeded: 0, failed: 0, invoice_status_sync: { synced: 0, failed: 0 } };
  }

  const now = new Date().toISOString();

  const { data: pending } = await admin
    .from("accounting_sync_records")
    .select("id, entity_type, entity_id, retry_count, sync_status, next_retry_at")
    .in("sync_status", ["pending", "failed"])
    .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
    .order("created_at", { ascending: true })
    .limit(limit);

  let succeeded = 0;
  let failed = 0;

  for (const record of (pending ?? []) as SyncRecord[]) {
    if (record.sync_status === "failed" && record.retry_count >= settings.max_retry_attempts) {
      continue;
    }
    await processSyncRecord(admin, record, settings);
    const { data: updated } = await admin
      .from("accounting_sync_records")
      .select("sync_status")
      .eq("id", record.id)
      .maybeSingle();
    if (updated?.sync_status === "synced") succeeded++;
    else failed++;
  }

  const invoiceStatusSync = await syncInvoiceStatusesFromZoho(admin, 25);

  await admin
    .from("zoho_integration_settings")
    .update({ last_sync_at: now, updated_at: now })
    .eq("singleton_key", "default");

  return {
    processed: (pending ?? []).length,
    succeeded,
    failed,
    invoice_status_sync: invoiceStatusSync,
  };
}

/**
 * Retry a single failed sync record (one-click retry from reconciliation UI).
 */
export async function retryAccountingSync(
  admin: SupabaseClient,
  recordId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: record } = await admin
    .from("accounting_sync_records")
    .select("id, entity_type, entity_id, retry_count, sync_status")
    .eq("id", recordId)
    .maybeSingle();

  if (!record) return { ok: false, error: "record_not_found" };

  await admin
    .from("accounting_sync_records")
    .update({ sync_status: "pending", next_retry_at: null, sync_errors: null })
    .eq("id", recordId);

  const settings = await loadZohoIntegrationSettings(admin);
  await processSyncRecord(admin, record as SyncRecord, settings);

  const { data: updated } = await admin
    .from("accounting_sync_records")
    .select("sync_status, sync_errors")
    .eq("id", recordId)
    .maybeSingle();

  if (updated?.sync_status === "synced") return { ok: true };
  return { ok: false, error: updated?.sync_errors ?? "sync_failed" };
}

export { computeNextRetryAt };
