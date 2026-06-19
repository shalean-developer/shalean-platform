import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingEarningsSummary } from "@/lib/payout/bookingEarningsSummary";
import {
  buildBookingRosterMemberPayoutRows,
  type BookingRosterMemberPayoutInsertRow,
} from "@/lib/payout/pairedRosterPayout";

export type SyncBookingRosterMemberPayoutsResult =
  | { ok: true; upserted: number; deleted: number }
  | { ok: false; error: string };

/**
 * Upserts non-lead roster member payout rows from earnings_summary.
 * Skips when any existing row is no longer `pending` (weekly batch lock).
 */
export async function syncBookingRosterMemberPayouts(params: {
  admin: SupabaseClient;
  bookingId: string;
  summary: BookingEarningsSummary;
  leaderId: string | null;
}): Promise<SyncBookingRosterMemberPayoutsResult> {
  const bookingId = params.bookingId.trim();
  if (!bookingId) return { ok: false, error: "Invalid booking id" };

  const { data: existing, error: exErr } = await params.admin
    .from("booking_roster_member_payouts")
    .select("id, cleaner_id, status, cleaner_payout_id")
    .eq("booking_id", bookingId);
  if (exErr) return { ok: false, error: exErr.message };

  const locked = (existing ?? []).some((row) => {
    const st = String((row as { status?: string | null }).status ?? "")
      .trim()
      .toLowerCase();
    const pid = String((row as { cleaner_payout_id?: string | null }).cleaner_payout_id ?? "").trim();
    return pid !== "" || (st !== "" && st !== "pending");
  });
  if (locked) return { ok: true, upserted: 0, deleted: 0 };

  const desired = buildBookingRosterMemberPayoutRows({
    bookingId,
    summary: params.summary,
    leaderId: params.leaderId,
  });
  const desiredIds = new Set(desired.map((row) => row.cleaner_id));

  let deleted = 0;
  for (const raw of existing ?? []) {
    const cid = String((raw as { cleaner_id?: string | null }).cleaner_id ?? "").trim();
    if (!cid || desiredIds.has(cid)) continue;
    const id = String((raw as { id?: string }).id ?? "").trim();
    if (!id) continue;
    const { error: delErr } = await params.admin.from("booking_roster_member_payouts").delete().eq("id", id);
    if (delErr) return { ok: false, error: delErr.message };
    deleted += 1;
  }

  let upserted = 0;
  for (const row of desired) {
    const written = await upsertRosterMemberRow(params.admin, row);
    if (!written.ok) return written;
    if (written.changed) upserted += 1;
  }

  return { ok: true, upserted, deleted };
}

async function upsertRosterMemberRow(
  admin: SupabaseClient,
  row: BookingRosterMemberPayoutInsertRow,
): Promise<{ ok: true; changed: boolean } | { ok: false; error: string }> {
  const { data: existing, error: exErr } = await admin
    .from("booking_roster_member_payouts")
    .select("id, payout_cents, bonus_cents, status")
    .eq("booking_id", row.booking_id)
    .eq("cleaner_id", row.cleaner_id)
    .maybeSingle();
  if (exErr) return { ok: false, error: exErr.message };

  if (!existing) {
    const { error: insErr } = await admin.from("booking_roster_member_payouts").insert(row);
    if (insErr) return { ok: false, error: insErr.message };
    return { ok: true, changed: true };
  }

  const prev = existing as {
    payout_cents?: number | null;
    bonus_cents?: number | null;
    status?: string | null;
  };
  const st = String(prev.status ?? "")
    .trim()
    .toLowerCase();
  if (st !== "" && st !== "pending") return { ok: true, changed: false };

  const same =
    Math.round(Number(prev.payout_cents) || 0) === row.payout_cents &&
    Math.round(Number(prev.bonus_cents) || 0) === row.bonus_cents;
  if (same) return { ok: true, changed: false };

  const { error: upErr } = await admin
    .from("booking_roster_member_payouts")
    .update({
      payout_cents: row.payout_cents,
      bonus_cents: row.bonus_cents,
      status: "pending",
    })
    .eq("booking_id", row.booking_id)
    .eq("cleaner_id", row.cleaner_id)
    .eq("status", "pending");
  if (upErr) return { ok: false, error: upErr.message };
  return { ok: true, changed: true };
}
