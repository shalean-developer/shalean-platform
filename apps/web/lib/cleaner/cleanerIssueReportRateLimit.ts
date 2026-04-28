import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

const WINDOW_MS = 10 * 60_000;
const MAX_REPORTS = 5;

/**
 * Max {@link MAX_REPORTS} new issue rows per rolling {@link WINDOW_MS} per (cleaner, booking).
 * Uses the database so limits hold across serverless instances.
 */
export async function checkCleanerIssueReportRateLimitDb(
  admin: SupabaseClient,
  cleanerId: string,
  bookingId: string,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { data: rows, error } = await admin
    .from("cleaner_job_issue_reports")
    .select("created_at")
    .eq("booking_id", bookingId)
    .eq("cleaner_id", cleanerId)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(MAX_REPORTS);

  if (error) {
    return { ok: false, retryAfterSec: 120 };
  }
  const list = (rows ?? []) as { created_at: string }[];
  if (list.length < MAX_REPORTS) return { ok: true };
  const oldest = new Date(String(list[0]!.created_at)).getTime();
  const retryAfterSec = Math.max(60, Math.ceil((oldest + WINDOW_MS - Date.now()) / 1000));
  return { ok: false, retryAfterSec };
}
