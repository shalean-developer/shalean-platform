import type { SupabaseClient } from "@supabase/supabase-js";
import { resyncBookingCleanersForTeamNonFinalizedJobs } from "@/lib/booking/syncBookingCleanersForTeamBooking";
import { isTeamMemberActiveOnBookingDate } from "@/lib/cleaner/teamMemberAvailability";

/**
 * Appoint (or change) the default team lead. Updates open team bookings' payout owner + roster sync.
 */
export async function setTeamLeadCleaner(
  admin: SupabaseClient,
  teamId: string,
  cleanerId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const tid = String(teamId ?? "").trim();
  const cid = String(cleanerId ?? "").trim();
  if (!tid || !cid) {
    return { ok: false, status: 400, error: "teamId and cleanerId are required." };
  }

  const { data: member, error: mErr } = await admin
    .from("team_members")
    .select("cleaner_id, active_from, active_to")
    .eq("team_id", tid)
    .eq("cleaner_id", cid)
    .maybeSingle();
  if (mErr) return { ok: false, status: 500, error: mErr.message };
  if (!member) {
    return { ok: false, status: 400, error: "Cleaner is not on this team roster." };
  }

  const { error: upErr } = await admin.from("teams").update({ lead_cleaner_id: cid }).eq("id", tid);
  if (upErr) return { ok: false, status: 500, error: upErr.message };

  const { data: openBookings, error: bErr } = await admin
    .from("bookings")
    .select("id, date")
    .eq("team_id", tid)
    .eq("is_team_job", true)
    .is("cleaner_line_earnings_finalized_at", null);
  if (bErr) return { ok: false, status: 500, error: bErr.message };

  for (const raw of openBookings ?? []) {
    const row = raw as { id?: string; date?: string | null };
    const bookingId = String(row.id ?? "").trim();
    const dateYmd = String(row.date ?? "").trim();
    if (!bookingId || !/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) continue;
    if (!isTeamMemberActiveOnBookingDate(member as { active_from?: string | null; active_to?: string | null }, dateYmd)) {
      continue;
    }
    await admin
      .from("bookings")
      .update({ payout_owner_cleaner_id: cid, cleaner_id: cid })
      .eq("id", bookingId);
  }

  await resyncBookingCleanersForTeamNonFinalizedJobs(admin, tid, "admin");
  return { ok: true };
}
