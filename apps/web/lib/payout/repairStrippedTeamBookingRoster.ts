import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { persistCleanerPayoutIfUnset } from "@/lib/payout/persistCleanerPayout";
import { resolvePersistCleanerIdForBooking } from "@/lib/payout/bookingEarningsIntegrity";

export type RepairStrippedTeamBookingRosterResult = {
  bookingId: string;
  ok: boolean;
  repaired: boolean;
  error?: string;
  restoredCleanerIds?: string[];
};

/**
 * Rebuild `booking_cleaners` + team payouts when a completed team job lost roster members
 * because `sync_booking_cleaners_for_team_booking` replaced the roster from current `team_members`.
 *
 * `participantCleanerIds` must be the cleaners who should receive payroll credit (lead first).
 */
export async function repairStrippedTeamBookingRoster(params: {
  admin: SupabaseClient;
  bookingId: string;
  participantCleanerIds: readonly string[];
  leadCleanerId?: string | null;
  source?: string;
}): Promise<RepairStrippedTeamBookingRosterResult> {
  const bookingId = String(params.bookingId ?? "").trim();
  const participants = [
    ...new Set(params.participantCleanerIds.map((id) => String(id ?? "").trim()).filter(Boolean)),
  ];
  if (!bookingId || participants.length === 0) {
    return { bookingId, ok: false, repaired: false, error: "Missing booking id or participants" };
  }

  const { data: booking, error: bErr } = await params.admin
    .from("bookings")
    .select(
      "id, status, is_team_job, team_id, payout_owner_cleaner_id, cleaner_id, cleaner_line_earnings_finalized_at",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (bErr || !booking) {
    return { bookingId, ok: false, repaired: false, error: bErr?.message ?? "Booking not found" };
  }

  const row = booking as {
    status?: string | null;
    is_team_job?: boolean | null;
    team_id?: string | null;
    payout_owner_cleaner_id?: string | null;
    cleaner_line_earnings_finalized_at?: string | null;
  };

  if (String(row.status ?? "").toLowerCase() !== "completed" || row.is_team_job !== true) {
    return { bookingId, ok: false, repaired: false, error: "Booking is not a completed team job" };
  }

  if (row.cleaner_line_earnings_finalized_at != null && String(row.cleaner_line_earnings_finalized_at).trim()) {
    return { bookingId, ok: false, repaired: false, error: "Roster locked (line earnings finalized)" };
  }

  const leadId =
    String(params.leadCleanerId ?? "").trim() ||
    String(row.payout_owner_cleaner_id ?? "").trim() ||
    participants[0]!;
  const teamId = String(row.team_id ?? "").trim();
  if (!teamId) {
    return { bookingId, ok: false, repaired: false, error: "Team job missing team_id" };
  }

  const { error: delRosterErr } = await params.admin.from("booking_cleaners").delete().eq("booking_id", bookingId);
  if (delRosterErr) {
    return { bookingId, ok: false, repaired: false, error: delRosterErr.message };
  }

  const rosterInserts = participants.map((cleanerId) => ({
    booking_id: bookingId,
    cleaner_id: cleanerId,
    role: cleanerId === leadId ? "lead" : "member",
    payout_weight: 1,
    lead_bonus_cents: 0,
    source: params.source ?? "repair_stripped_team_roster",
  }));
  const { error: insRosterErr } = await params.admin.from("booking_cleaners").insert(rosterInserts);
  if (insRosterErr) {
    return { bookingId, ok: false, repaired: false, error: insRosterErr.message };
  }

  const { error: headerErr } = await params.admin
    .from("bookings")
    .update({
      payout_owner_cleaner_id: leadId,
      cleaner_id: leadId,
      team_member_count_snapshot: participants.length,
    })
    .eq("id", bookingId);
  if (headerErr) {
    return { bookingId, ok: false, repaired: false, error: headerErr.message };
  }

  const { error: delPayErr } = await params.admin.from("team_job_member_payouts").delete().eq("booking_id", bookingId);
  if (delPayErr) {
    return { bookingId, ok: false, repaired: false, error: delPayErr.message };
  }

  const persist = await persistCleanerPayoutIfUnset({
    admin: params.admin,
    bookingId,
    cleanerId: leadId,
    forceDisplayRecompute: true,
  });
  if (!persist.ok) {
    return { bookingId, ok: false, repaired: false, error: persist.error };
  }

  void logSystemEvent({
    level: "info",
    source: params.source ?? "repairStrippedTeamBookingRoster",
    message: "team_booking_roster_restored",
    context: {
      bookingId,
      team_id: teamId,
      lead_cleaner_id: leadId,
      participant_cleaner_ids: participants,
      persist_skipped: persist.skipped,
    },
  });

  return {
    bookingId,
    ok: true,
    repaired: true,
    restoredCleanerIds: participants,
  };
}

/** Find completed team jobs whose roster is smaller than `team_member_count_snapshot`. */
export async function listTeamBookingsWithStrippedRoster(
  admin: SupabaseClient,
  opts?: { from?: string; to?: string; limit?: number },
): Promise<Array<{ bookingId: string; snapshot: number; rosterCount: number }>> {
  const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 1000);
  let q = admin
    .from("bookings")
    .select("id, team_member_count_snapshot")
    .eq("status", "completed")
    .eq("is_team_job", true)
    .eq("is_test", false)
    .gt("team_member_count_snapshot", 1)
    .order("date", { ascending: false })
    .limit(limit);
  if (opts?.from) q = q.gte("date", opts.from);
  if (opts?.to) q = q.lte("date", opts.to);

  const { data, error } = await q;
  if (error || !data?.length) return [];

  const out: Array<{ bookingId: string; snapshot: number; rosterCount: number }> = [];
  for (const raw of data) {
    const bookingId = String((raw as { id?: string }).id ?? "").trim();
    const snapshot = Math.floor(Number((raw as { team_member_count_snapshot?: number }).team_member_count_snapshot) || 0);
    if (!bookingId || snapshot <= 1) continue;

    const { count } = await admin
      .from("booking_cleaners")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", bookingId);
    const rosterCount = count ?? 0;
    if (rosterCount < snapshot) {
      out.push({ bookingId, snapshot, rosterCount });
    }
  }
  return out;
}

export async function resolveLeadCleanerIdForBooking(
  admin: SupabaseClient,
  bookingId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("bookings")
    .select("payout_owner_cleaner_id, cleaner_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (!data) return null;
  return resolvePersistCleanerIdForBooking(
    data as { payout_owner_cleaner_id?: string | null; cleaner_id?: string | null; is_team_job?: boolean },
  );
}
