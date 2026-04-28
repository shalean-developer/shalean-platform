import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isBillingSwitchTerminalCacheCode } from "@/lib/admin/billingSwitchCodes";
import { logSystemEvent } from "@/lib/logging/systemLog";

/** In-process + DB replay; TTL 12 minutes (cross-instance via `admin_billing_idempotency`). */
const TTL_MS = 12 * 60 * 1000;
const MAX_MEMORY_ENTRIES = 200;

type MemoryEntry = { expiresAt: number; status: number; body: Record<string, unknown> };

const memoryStore = new Map<string, MemoryEntry>();

function pruneMemory(now: number): void {
  for (const [k, v] of memoryStore) {
    if (v.expiresAt < now) memoryStore.delete(k);
  }
  if (memoryStore.size <= MAX_MEMORY_ENTRIES) return;
  const sorted = [...memoryStore.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
  while (sorted.length > MAX_MEMORY_ENTRIES) {
    const drop = sorted.shift();
    if (drop) memoryStore.delete(drop[0]);
  }
}

export function billingSwitchIdempotencyRowId(customerId: string, idempotencyKey: string): string {
  return `${customerId}:${idempotencyKey}`;
}

export function readBillingSwitchIdempotencyKey(request: Request): string | null {
  const raw = request.headers.get("Idempotency-Key")?.trim();
  if (!raw || raw.length > 256) return null;
  return raw;
}

function tryReplayMemory(
  customerId: string,
  idempotencyKey: string,
): { status: number; body: Record<string, unknown> } | null {
  const now = Date.now();
  pruneMemory(now);
  const k = billingSwitchIdempotencyRowId(customerId, idempotencyKey);
  const e = memoryStore.get(k);
  if (!e || e.expiresAt < now) {
    if (e) memoryStore.delete(k);
    return null;
  }
  return { status: e.status, body: e.body };
}

async function tryReplayDb(
  admin: SupabaseClient,
  customerId: string,
  idempotencyKey: string,
): Promise<{ status: number; body: Record<string, unknown> } | null> {
  const id = billingSwitchIdempotencyRowId(customerId, idempotencyKey);
  /** TTL enforced at read time so stale rows are never replayed if prune cron lags. */
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("admin_billing_idempotency")
    .select("status, response")
    .eq("id", id)
    .eq("user_id", customerId)
    .gt("expires_at", nowIso)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as { status?: string; response?: unknown };
  const status = Math.round(Number(row.status ?? 200));
  const body = row.response;
  if (body == null || typeof body !== "object" || Array.isArray(body)) return null;
  return {
    status: Number.isFinite(status) && status >= 200 && status < 600 ? status : 200,
    body: body as Record<string, unknown>,
  };
}

export async function tryReplayBillingSwitchSuccess(
  admin: SupabaseClient,
  customerId: string,
  idempotencyKey: string,
): Promise<{ status: number; body: Record<string, unknown> } | null> {
  const mem = tryReplayMemory(customerId, idempotencyKey);
  if (mem) return mem;
  return tryReplayDb(admin, customerId, idempotencyKey);
}

function rememberMemory(customerId: string, idempotencyKey: string, status: number, body: Record<string, unknown>): void {
  const now = Date.now();
  pruneMemory(now);
  memoryStore.set(billingSwitchIdempotencyRowId(customerId, idempotencyKey), {
    expiresAt: now + TTL_MS,
    status,
    body,
  });
}

export async function rememberBillingSwitchSuccess(
  admin: SupabaseClient,
  customerId: string,
  idempotencyKey: string,
  status: number,
  body: Record<string, unknown>,
): Promise<void> {
  if (!isBillingSwitchTerminalCacheCode(body.code)) return;

  rememberMemory(customerId, idempotencyKey, status, body);

  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
  const id = billingSwitchIdempotencyRowId(customerId, idempotencyKey);
  const { error } = await admin.from("admin_billing_idempotency").upsert(
    {
      id,
      user_id: customerId,
      status: String(status),
      response: body,
      expires_at: expiresAt,
    },
    { onConflict: "id" },
  );

  if (error && (error as { code?: string }).code !== "23505") {
    await logSystemEvent({
      level: "warn",
      source: "admin_billing_switch_idempotency",
      message: "admin_billing_idempotency_upsert_failed",
      context: { customer_id: customerId, message: error.message },
    });
  }
}
