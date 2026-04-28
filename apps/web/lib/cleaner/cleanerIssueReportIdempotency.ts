import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const IDEM_TTL_MS = 5 * 60_000;

export function hashCleanerIssueIdempotencyKey(cleanerId: string, bookingId: string, idempotencyKey: string): string {
  return createHash("sha256").update(`${cleanerId}\n${bookingId}\n${idempotencyKey}`, "utf8").digest("hex");
}

export async function findActiveIdempotencyReport(
  admin: SupabaseClient,
  cleanerId: string,
  bookingId: string,
  keyHash: string,
): Promise<string | null> {
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("cleaner_job_issue_report_idempotency")
    .select("report_id")
    .eq("cleaner_id", cleanerId)
    .eq("booking_id", bookingId)
    .eq("key_hash", keyHash)
    .gte("expires_at", nowIso)
    .maybeSingle();
  if (error || !data || typeof (data as { report_id?: string }).report_id !== "string") return null;
  return (data as { report_id: string }).report_id;
}

export async function registerCleanerIssueIdempotency(
  admin: SupabaseClient,
  params: { cleanerId: string; bookingId: string; keyHash: string; reportId: string },
): Promise<void> {
  const expires_at = new Date(Date.now() + IDEM_TTL_MS).toISOString();
  const { error } = await admin.from("cleaner_job_issue_report_idempotency").insert({
    cleaner_id: params.cleanerId,
    booking_id: params.bookingId,
    key_hash: params.keyHash,
    report_id: params.reportId,
    expires_at,
  });
  if (error && error.code !== "23505") {
    void error;
  }
}
