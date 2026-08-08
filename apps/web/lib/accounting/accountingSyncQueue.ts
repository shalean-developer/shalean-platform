import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadZohoIntegrationSettings } from "@/lib/accounting/zohoIntegrationSettings";

export type AccountingSyncEntityType =
  | "expense"
  | "recurring_expense"
  | "budget"
  | "expense_account"
  | "booking"
  | "invoice"
  | "vendor"
  | "payment_transaction"
  | "refund";

/**
 * Enqueue or refresh a pending sync record. Idempotent per (entity_type, entity_id).
 */
export async function enqueueAccountingSync(
  admin: SupabaseClient,
  params: {
    entityType: AccountingSyncEntityType;
    entityId: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  const settings = await loadZohoIntegrationSettings(admin);
  if (!settings.auto_sync_enabled) return;

  const now = new Date().toISOString();
  const { data: existing } = await admin
    .from("accounting_sync_records")
    .select("id, sync_status")
    .eq("entity_type", params.entityType)
    .eq("entity_id", params.entityId)
    .maybeSingle();

  if (existing?.sync_status === "synced") return;

  if (existing?.id) {
    await admin
      .from("accounting_sync_records")
      .update({
        sync_status: "pending",
        sync_errors: null,
        payload: params.payload ?? null,
        updated_at: now,
      })
      .eq("id", existing.id);
    return;
  }

  await admin.from("accounting_sync_records").insert({
    entity_type: params.entityType,
    entity_id: params.entityId,
    sync_status: "pending",
    payload: params.payload ?? null,
    created_at: now,
    updated_at: now,
  });
}

export function computeNextRetryAt(retryCount: number, baseDelaySeconds: number): string {
  const delayMs = Math.min(3600_000, baseDelaySeconds * 1000 * 2 ** retryCount);
  return new Date(Date.now() + delayMs).toISOString();
}

export async function markSyncFailed(
  admin: SupabaseClient,
  recordId: string,
  error: string,
  retryCount: number,
  maxRetries: number,
  baseDelaySeconds: number,
): Promise<void> {
  const now = new Date().toISOString();
  const nextRetry =
    retryCount + 1 < maxRetries ? computeNextRetryAt(retryCount, baseDelaySeconds) : null;

  await admin
    .from("accounting_sync_records")
    .update({
      sync_status: "failed",
      sync_errors: error.slice(0, 2000),
      retry_count: retryCount + 1,
      next_retry_at: nextRetry,
      updated_at: now,
    })
    .eq("id", recordId);
}

export async function markSyncSucceeded(
  admin: SupabaseClient,
  recordId: string,
  externalAccountingId?: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  await admin
    .from("accounting_sync_records")
    .update({
      sync_status: "synced",
      external_accounting_id: externalAccountingId ?? null,
      sync_errors: null,
      last_synced_at: now,
      next_retry_at: null,
      updated_at: now,
    })
    .eq("id", recordId);
}
