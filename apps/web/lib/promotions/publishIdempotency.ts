import "server-only";

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side publish idempotency (MKT-001A / WS4).
 *
 * Backed by `marketing_publish_idempotency` with a UNIQUE(provider, idempotency_key)
 * constraint. The database is the concurrency arbiter: the first INSERT wins; any
 * concurrent duplicate hits the unique constraint and is routed to a replay /
 * in-progress / conflict response instead of publishing again.
 */

export type PublishProvider = "facebook" | "google_business";

const UNIQUE_VIOLATION = "23505";

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
  | { outcome: "claimed"; id: string; idempotencyKey: string }
  | { outcome: "retry"; id: string; idempotencyKey: string }
  | { outcome: "duplicate_succeeded"; externalPostId: string | null }
  | { outcome: "in_progress" }
  | { outcome: "conflict" }
  | { outcome: "error"; error: string };

type IdemRow = {
  id: string;
  status: "processing" | "succeeded" | "failed";
  external_post_id: string | null;
  request_hash: string;
};

/**
 * Atomically claim the right to publish for a logical operation.
 * - `claimed`  → brand-new operation; proceed to publish.
 * - `retry`    → prior attempt failed; re-claimed; proceed to publish.
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
      published_by: publishedBy,
    })
    .select("id")
    .single();

  if (!insert.error && insert.data) {
    return { outcome: "claimed", id: insert.data.id as string, idempotencyKey };
  }

  // Not a duplicate-key error → surface as a real error.
  if (insert.error && insert.error.code !== UNIQUE_VIOLATION) {
    return { outcome: "error", error: insert.error.message };
  }

  // Duplicate key: inspect the existing row.
  const existing = await admin
    .from("marketing_publish_idempotency")
    .select("id, status, external_post_id, request_hash")
    .eq("provider", identity.provider)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existing.error || !existing.data) {
    return { outcome: "error", error: existing.error?.message ?? "Idempotency lookup failed." };
  }

  const row = existing.data as IdemRow;

  if (row.request_hash !== requestHash) {
    return { outcome: "conflict" };
  }
  if (row.status === "succeeded") {
    return { outcome: "duplicate_succeeded", externalPostId: row.external_post_id };
  }
  if (row.status === "processing") {
    return { outcome: "in_progress" };
  }

  // status === 'failed' → attempt an atomic re-claim (only one caller wins).
  const reclaim = await admin
    .from("marketing_publish_idempotency")
    .update({
      status: "processing",
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("status", "failed")
    .select("id")
    .maybeSingle();

  if (reclaim.error) {
    return { outcome: "error", error: reclaim.error.message };
  }
  if (!reclaim.data) {
    // Someone else re-claimed it first.
    return { outcome: "in_progress" };
  }
  return { outcome: "retry", id: row.id, idempotencyKey };
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
