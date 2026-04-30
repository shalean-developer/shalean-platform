import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { reportOperationalIssue } from "@/lib/logging/systemLog";

export type EnsureCleanerEarningsLedgerResult =
  | { ok: true; skipped: true; reason: string }
  | { ok: true; skipped: false; earnings_id: string }
  | { ok: false; error: string };

/**
 * Inserts `cleaner_earnings` when booking is completed, line earnings finalized, solo job.
 * Idempotent on `booking_id` (unique index).
 */
export async function ensureCleanerEarningsLedgerRow(params: {
  admin: SupabaseClient;
  bookingId: string;
}): Promise<EnsureCleanerEarningsLedgerResult> {
  const { admin, bookingId } = params;
  const bid = bookingId.trim();
  if (!bid) return { ok: false, error: "Invalid booking id" };

  const { data: b, error: bErr } = await admin
    .from("bookings")
    .select("id, status, cleaner_id, is_team_job, cleaner_line_earnings_finalized_at, cleaner_earnings_total_cents")
    .eq("id", bid)
    .maybeSingle();
  if (bErr || !b) return { ok: false, error: bErr?.message ?? "Booking not found" };

  const row = b as {
    status?: string | null;
    cleaner_id?: string | null;
    is_team_job?: boolean | null;
    cleaner_line_earnings_finalized_at?: string | null;
    cleaner_earnings_total_cents?: number | null;
  };

  if (String(row.status ?? "").toLowerCase() !== "completed") {
    return { ok: true, skipped: true, reason: "not_completed" };
  }
  if (row.is_team_job === true) {
    return { ok: true, skipped: true, reason: "team_job" };
  }
  if (row.cleaner_line_earnings_finalized_at == null || String(row.cleaner_line_earnings_finalized_at).trim() === "") {
    return { ok: true, skipped: true, reason: "line_earnings_not_finalized" };
  }

  const cleanerId = String(row.cleaner_id ?? "").trim();
  if (!cleanerId) {
    return { ok: true, skipped: true, reason: "no_cleaner" };
  }

  const amount = Math.max(0, Math.round(Number(row.cleaner_earnings_total_cents) || 0));

  const { data: existing, error: exErr } = await admin.from("cleaner_earnings").select("id").eq("booking_id", bid).maybeSingle();
  if (exErr) return { ok: false, error: exErr.message };
  if (existing && typeof (existing as { id?: string }).id === "string") {
    return { ok: true, skipped: true, reason: "already_exists" };
  }

  const { data: ins, error: insErr } = await admin
    .from("cleaner_earnings")
    .insert({
      cleaner_id: cleanerId,
      booking_id: bid,
      amount_cents: amount,
      status: "pending",
    })
    .select("id")
    .maybeSingle();

  if (insErr) {
    if (insErr.code === "23505") {
      return { ok: true, skipped: true, reason: "already_exists" };
    }
    void reportOperationalIssue("error", "ensureCleanerEarningsLedgerRow", insErr.message, { bookingId: bid });
    return { ok: false, error: insErr.message };
  }

  const id = (ins as { id?: string } | null)?.id;
  if (!id) return { ok: false, error: "Insert did not return id" };
  return { ok: true, skipped: false, earnings_id: id };
}
