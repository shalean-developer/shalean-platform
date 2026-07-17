import "server-only";

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side publish idempotency (MKT-001A / WS4 + MKT-001B reliability).
 *
 * Backed by `marketing_publish_idempotency` with a UNIQUE(provider, idempotency_key)
 * constraint. The database is the concurrency arbiter: the first INSERT wins; any
 * concurrent duplicate hits the unique constraint and is routed to a replay /
 * in-progress / conflict response instead of publishing again.
 *
 * MKT-001B additions:
 * - Stuck `processing` rows older than STUCK_PROCESSING_TTL_MS are reclaimable
 *   (deployment crash / worker kill no longer permanently 409s the key).
 * - `attempts` is incremented on every reclaim / failed→retry.
 */

export type PublishProvider = "facebook" | "google_business";

const UNIQUE_VIOLATION = "23505";

/** After this age, a `processing` row is treated as abandoned and may be reclaimed. */
export const STUCK_PROCESSING_TTL_MS = 10 * 60 * 1000; // 10 minutes

export type PublishIdentity = {
  provider: PublishProvider;
  targetRef: string | null;
  promotionId?: string | null;
  message: string;
  link?: string | null;
  /** Optional client-supplied override for deliberate re-posts. */
  explicitKey?: string | null;
};

/** Stable content hash used for both the derived key and payload-change detection. */
export function computeRequestHash(identity: PublishIdentity): string {
  const canonical = JSON.stringify({
    provider: identity.provider,
    targetRef: identity.targetRef ?? "",
    promotionId: identity.promotionId ?? "",
    message: identity.message.trim(),
    link: (identity.link ?? "").trim(),
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * Resolve the idempotency key: an explicit client key (for deliberate reposts)
 * or a deterministic hash of the logical publish payload (dedupes double-clicks
 * and retries of identical content).
 */
export function resolveIdempotencyKey(identity: PublishIdentity, requestHash: string): string {
  const explicit = identity.explicitKey?.trim();
  if (explicit) return explicit.slice(0, 200);
  return requestHash;
}

export type ClaimResult =
  | { outcome: "claimed"; id: string; idempotencyKey: string; attempts: number }
  | { outcome: "retry"; id: string; idempotencyKey: string; attempts: number }
  | { outcome: "duplicate_succeeded"; externalPostId: string | null }
  | { outcome: "in_progress" }
  | { outcome: "conflict" }
  | { outcome: "error"; error: string };

type IdemRow = {
  id: string;
  status: "processing" | "succeeded" | "failed";
  external_post_id: string | null;
  request_hash: string;
  attempts: number;
  updated_at: string;
};

export function isStuckProcessing(updatedAtIso: string, nowMs: number = Date.now()): boolean {
  const updated = Date.parse(updatedAtIso);
  if (Number.isNaN(updated)) return true;
  return nowMs - updated >= STUCK_PROCESSING_TTL_MS;
}

async function reclaimRow(
  admin: SupabaseClient,
  row: IdemRow,
  idempotencyKey: string,
  nextAttempts: number,
): Promise<ClaimResult> {
  const reclaim = await admin
    .from("marketing_publish_idempotency")
    .update({
      status: "processing",
      error_message: null,
      attempts: nextAttempts,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("status", row.status)
    .select("id, attempts")
    .maybeSingle();

  if (reclaim.error) {
    return { outcome: "error", error: reclaim.error.message };
  }
  if (!reclaim.data) {
    // Someone else re-claimed or completed it first.
    return { outcome: "in_progress" };
  }
  return {
    outcome: "retry",
    id: row.id,
    idempotencyKey,
    attempts: (reclaim.data as { attempts?: number }).attempts ?? nextAttempts,
  };
}

/**
 * Atomically claim the right to publish for a logical operation.
 * - `claimed`  → brand-new operation; proceed to publish.
 * - `retry`    → prior attempt failed or stuck processing; re-claimed; proceed.
 * - `duplicate_succeeded` → already published; return the original result.
 * - `in_progress` → a concurrent publish is running; do not publish.
 * - `conflict` → key reused with a different payload; refuse.
 */
export async function claimPublish(
  admin: SupabaseClient,
  identity: PublishIdentity,
  publishedBy: string,
): Promise<ClaimResult> {
  const requestHash = computeRequestHash(identity);
  const idempotencyKey = resolveIdempotencyKey(identity, requestHash);

  const insert = await admin
    .from("marketing_publish_idempotency")
    .insert({
      idempotency_key: idempotencyKey,
      provider: identity.provider,
      target_ref: identity.targetRef,
      promotion_id: identity.promotionId ?? null,
      request_hash: requestHash,
      status: "processing",
      attempts: 1,
      published_by: publishedBy,
    })
    .select("id, attempts")
    .single();

  if (!insert.error && insert.data) {
    return {
      outcome: "claimed",
      id: insert.data.id as string,
      idempotencyKey,
      attempts: (insert.data as { attempts?: number }).attempts ?? 1,
    };
  }

  // Not a duplicate-key error → surface as a real error.
  if (insert.error && insert.error.code !== UNIQUE_VIOLATION) {
    return { outcome: "error", error: insert.error.message };
  }

  // Duplicate key: inspect the existing row.
  const existing = await admin
    .from("marketing_publish_idempotency")
    .select("id, status, external_post_id, request_hash, attempts, updated_at")
    .eq("provider", identity.provider)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existing.error || !existing.data) {
    return { outcome: "error", error: existing.error?.message ?? "Idempotency lookup failed." };
  }

  const row = existing.data as IdemRow;
  const attempts = typeof row.attempts === "number" ? row.attempts : 1;

  if (row.request_hash !== requestHash) {
    return { outcome: "conflict" };
  }
  if (row.status === "succeeded") {
    return { outcome: "duplicate_succeeded", externalPostId: row.external_post_id };
  }
  if (row.status === "processing") {
    if (!isStuckProcessing(row.updated_at)) {
      return { outcome: "in_progress" };
    }
    return reclaimRow(admin, row, idempotencyKey, attempts + 1);
  }

  // status === 'failed' → attempt an atomic re-claim (only one caller wins).
  return reclaimRow(admin, row, idempotencyKey, attempts + 1);
}

export async function markPublishSucceeded(
  admin: SupabaseClient,
  id: string,
  externalPostId: string | null,
): Promise<void> {
  await admin
    .from("marketing_publish_idempotency")
    .update({
      status: "succeeded",
      external_post_id: externalPostId,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}

export async function markPublishFailed(
  admin: SupabaseClient,
  id: string,
  errorMessage: string,
): Promise<void> {
  await admin
    .from("marketing_publish_idempotency")
    .update({
      status: "failed",
      error_message: errorMessage.slice(0, 2000),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}

export type RecoverStuckResult = {
  scanned: number;
  recovered: number;
  errors: string[];
};

/**
 * Mark abandoned `processing` rows as `failed` so operators can see them and
 * the next admin retry reclaim path works cleanly.
 * Safe to run from cron; never throws.
 */
export async function recoverStuckPublishClaims(
  admin: SupabaseClient,
  opts?: { olderThanMs?: number; limit?: number },
): Promise<RecoverStuckResult> {
  const olderThanMs = opts?.olderThanMs ?? STUCK_PROCESSING_TTL_MS;
  const limit = opts?.limit ?? 100;
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  const errors: string[] = [];

  const listed = await admin
    .from("marketing_publish_idempotency")
    .select("id, updated_at")
    .eq("status", "processing")
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (listed.error) {
    return { scanned: 0, recovered: 0, errors: [listed.error.message] };
  }

  const rows = (listed.data ?? []) as Array<{ id: string; updated_at: string }>;
  let recovered = 0;

  for (const row of rows) {
    const upd = await admin
      .from("marketing_publish_idempotency")
      .update({
        status: "failed",
        error_message: "Abandoned: publish interrupted before completion (stuck processing TTL).",
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("status", "processing")
      .select("id")
      .maybeSingle();

    if (upd.error) {
      errors.push(`${row.id}: ${upd.error.message}`);
      continue;
    }
    if (upd.data) recovered += 1;
  }

  return { scanned: rows.length, recovered, errors };
}
