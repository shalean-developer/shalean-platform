import type { SupabaseClient } from "@supabase/supabase-js";
import { countActiveTeamMembersOnDate } from "@/lib/cleaner/teamMemberAvailability";
import { isTeamService, teamServiceType } from "@/lib/dispatch/assignBooking";
import { CAPACITY_STATUSES } from "@/lib/dispatch/assignTeamToBooking";
import { logSystemEvent } from "@/lib/logging/systemLog";

/** Per-member team job payout (cents) — aligned with ops smoke / cleaner earnings expectations. */
export const ADMIN_TEAM_MEMBER_PAYOUT_CENTS = 25_000;

type BookingRow = {
  id: string;
  date: string | null;
  service: string | null;
  booking_snapshot?: unknown;
  team_id: string | null;
  is_team_job: boolean | null;
  status: string | null;
};

function teamDayCapacitySlots(capacityPerDay: number | null | undefined): number {
  return Math.max(1, Number(capacityPerDay ?? 0) || 0);
}

export async function countTeamJobSlotsUsedOnDate(
  admin: SupabaseClient,
  teamId: string,
  dateYmd: string,
  excludeBookingId?: string,
): Promise<{ count: number; error: string | null }> {
  let q = admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId)
    .eq("date", dateYmd)
    .eq("is_team_job", true)
    .in("status", [...CAPACITY_STATUSES]);
  if (excludeBookingId) {
    q = q.neq("id", excludeBookingId);
  }
  const { count, error } = await q;
  if (error) return { count: 0, error: error.message };
  return { count: count ?? 0, error: null };
}

export type AdminAssignTeamOptions = {
  admin: SupabaseClient;
  bookingId: string;
  teamId: string;
  adminUserId: string;
  adminEmail?: string | null;
};

export type AdminAssignTeamResult =
  | { ok: true; teamId: string; oldTeamId: string | null }
  | { ok: false; httpStatus: number; error: string };

export async function performAdminAssignTeam(opts: AdminAssignTeamOptions): Promise<AdminAssignTeamResult> {
  const { admin, bookingId, teamId, adminUserId, adminEmail } = opts;
  const tid = String(teamId ?? "").trim();
  if (!tid || !/^[0-9a-f-]{36}$/i.test(tid)) {
    return { ok: false, httpStatus: 400, error: "Invalid teamId." };
  }

  const { data: booking, error: bErr } = await admin
    .from("bookings")
    .select("id, date, service, booking_snapshot, team_id, is_team_job, status")
    .eq("id", bookingId)
    .maybeSingle();
  if (bErr) return { ok: false, httpStatus: 500, error: bErr.message };
  if (!booking) return { ok: false, httpStatus: 404, error: "Booking not found." };

  const b = booking as BookingRow;
  const stBooking = String(b.status ?? "").toLowerCase();
  if (stBooking === "pending_payment" || stBooking === "payment_expired") {
    return {
      ok: false,
      httpStatus: 400,
      error: "Awaiting customer payment — assign a team after the customer has paid.",
    };
  }
  if (!isTeamService(b)) {
    return { ok: false, httpStatus: 400, error: "Booking service is not team-based (deep / move)." };
  }

  const expectedService = teamServiceType(b);
  const { data: team, error: tErr } = await admin
    .from("teams")
    .select("id, name, service_type, capacity_per_day, is_active")
    .eq("id", tid)
    .maybeSingle();
  if (tErr) return { ok: false, httpStatus: 500, error: tErr.message };
  if (!team || !(team as { is_active?: boolean }).is_active) {
    return { ok: false, httpStatus: 400, error: "Team not found or inactive." };
  }
  if (String((team as { service_type?: string }).service_type ?? "") !== expectedService) {
    return { ok: false, httpStatus: 400, error: "Team service type does not match this booking." };
  }

  const dateYmd = String(b.date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
    return { ok: false, httpStatus: 400, error: "Booking date is required for team assignment." };
  }

  const { data: memberRows, error: mErr } = await admin
    .from("team_members")
    .select("cleaner_id, active_from, active_to")
    .eq("team_id", tid)
    .not("cleaner_id", "is", null);
  if (mErr) return { ok: false, httpStatus: 500, error: mErr.message };
  const rosterCount = countActiveTeamMembersOnDate(memberRows ?? [], dateYmd);
  if (rosterCount <= 0) {
    return { ok: false, httpStatus: 400, error: "Team has no active members on the booking date." };
  }

  const cap = teamDayCapacitySlots((team as { capacity_per_day?: number }).capacity_per_day);
  const { count: usedExcludingThis, error: slotErr } = await countTeamJobSlotsUsedOnDate(admin, tid, dateYmd, bookingId);
  if (slotErr) return { ok: false, httpStatus: 500, error: slotErr };
  if (usedExcludingThis >= cap) {
    return { ok: false, httpStatus: 409, error: "Team is at capacity for this booking date." };
  }

  const oldTeamId = typeof b.team_id === "string" && b.team_id.trim() ? b.team_id.trim() : null;
  const sameTeam = oldTeamId === tid && b.is_team_job === true;

  let oldTeamCapacity = 1;
  if (oldTeamId) {
    const { data: oldT } = await admin.from("teams").select("capacity_per_day").eq("id", oldTeamId).maybeSingle();
    oldTeamCapacity = teamDayCapacitySlots((oldT as { capacity_per_day?: number } | null)?.capacity_per_day);
  }

  if (!sameTeam) {
    if (oldTeamId && oldTeamId !== tid) {
      const { error: relErr } = await admin.rpc("release_team_capacity_slot", {
        p_team_id: oldTeamId,
        p_booking_date: dateYmd,
      });
      if (relErr) {
        return { ok: false, httpStatus: 500, error: `Could not release prior team capacity: ${relErr.message}` };
      }
    }

    const needsClaim = !oldTeamId || oldTeamId !== tid;
    if (needsClaim) {
      const { data: claimed, error: claimErr } = await admin.rpc("claim_team_capacity_slot", {
        p_team_id: tid,
        p_booking_date: dateYmd,
        p_capacity_per_day: cap,
      });
      if (claimErr) {
        if (oldTeamId && oldTeamId !== tid) {
          await admin.rpc("claim_team_capacity_slot", {
            p_team_id: oldTeamId,
            p_booking_date: dateYmd,
            p_capacity_per_day: oldTeamCapacity,
          });
        }
        return { ok: false, httpStatus: 500, error: claimErr.message };
      }
      if (claimed !== true) {
        if (oldTeamId && oldTeamId !== tid) {
          await admin.rpc("claim_team_capacity_slot", {
            p_team_id: oldTeamId,
            p_booking_date: dateYmd,
            p_capacity_per_day: oldTeamCapacity,
          });
        }
        return { ok: false, httpStatus: 409, error: "Team at capacity (claim rejected)." };
      }
    }
  }

  const { error: updErr } = await admin
    .from("bookings")
    .update({
      team_id: tid,
      is_team_job: true,
      cleaner_id: null,
      team_member_count_snapshot: rosterCount,
    })
    .eq("id", bookingId);
  if (updErr) {
    return { ok: false, httpStatus: 500, error: updErr.message };
  }

  const { error: delPayErr } = await admin.from("team_job_member_payouts").delete().eq("booking_id", bookingId);
  if (delPayErr) {
    return { ok: false, httpStatus: 500, error: `Failed clearing payouts: ${delPayErr.message}` };
  }

  const { error: delAssignErr } = await admin.from("booking_team_assignments").delete().eq("booking_id", bookingId);
  if (delAssignErr) {
    return { ok: false, httpStatus: 500, error: `Failed clearing team assignment rows: ${delAssignErr.message}` };
  }

  const activeCleanerIds = [
    ...new Set(
      (memberRows ?? [])
        .map((row) => row as { cleaner_id?: string | null; active_from?: string | null; active_to?: string | null })
        .filter((row) => countActiveTeamMembersOnDate([row], dateYmd) > 0)
        .map((row) => String(row.cleaner_id ?? "").trim())
        .filter(Boolean),
    ),
  ];

  const payoutRows = activeCleanerIds.map((cleaner_id) => ({
    booking_id: bookingId,
    team_id: tid,
    cleaner_id,
    payout_cents: ADMIN_TEAM_MEMBER_PAYOUT_CENTS,
    status: "pending",
  }));
  if (payoutRows.length > 0) {
    const { error: insPayErr } = await admin.from("team_job_member_payouts").insert(payoutRows);
    if (insPayErr) {
      return { ok: false, httpStatus: 500, error: `Failed inserting payouts: ${insPayErr.message}` };
    }
  }

  const nowIso = new Date().toISOString();
  const { error: insAssignErr } = await admin.from("booking_team_assignments").insert({
    booking_id: bookingId,
    team_id: tid,
    status: "assigned",
    assigned_at: nowIso,
  });
  if (insAssignErr) {
    return { ok: false, httpStatus: 500, error: `Failed recording team assignment: ${insAssignErr.message}` };
  }

  void logSystemEvent({
    level: "info",
    source: "ADMIN_TEAM_OVERRIDE",
    message: "Admin manually assigned or changed team for booking",
    context: {
      bookingId,
      oldTeamId: oldTeamId ?? null,
      newTeamId: tid,
      adminId: adminUserId,
      adminEmail: adminEmail ?? null,
    },
  });

  return { ok: true, teamId: tid, oldTeamId };
}

export type TeamAssignCandidateRow = {
  id: string;
  name: string;
  service_type: string;
  capacity_per_day: number;
  member_count: number;
  used_slots_today: number;
  remaining_slots_today: number;
  /** False when roster empty or no spare day slot for this booking to land on this team. */
  assignable: boolean;
};

export async function listTeamAssignCandidatesForBooking(
  admin: SupabaseClient,
  booking: Pick<BookingRow, "service" | "booking_snapshot" | "date" | "id">,
): Promise<{ teams: TeamAssignCandidateRow[]; error: string | null }> {
  if (!isTeamService(booking as BookingRow)) {
    return { teams: [], error: null };
  }
  const dateYmd = String(booking.date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
    return { teams: [], error: "Booking date invalid." };
  }
  const st = teamServiceType(booking as BookingRow);
  const { data: teams, error: tErr } = await admin
    .from("teams")
    .select("id, name, service_type, capacity_per_day, is_active")
    .eq("service_type", st)
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(100);
  if (tErr) return { teams: [], error: tErr.message };

  const out: TeamAssignCandidateRow[] = [];
  for (const raw of teams ?? []) {
    const row = raw as { id: string; name: string; service_type: string; capacity_per_day: number };
    const { data: members } = await admin
      .from("team_members")
      .select("cleaner_id, active_from, active_to")
      .eq("team_id", row.id)
      .not("cleaner_id", "is", null);
    const memberCount = countActiveTeamMembersOnDate(members ?? [], dateYmd);
    const { count: usedFull } = await countTeamJobSlotsUsedOnDate(admin, row.id, dateYmd);
    const { count: usedExcl } = await countTeamJobSlotsUsedOnDate(admin, row.id, dateYmd, booking.id);
    const cap = teamDayCapacitySlots(row.capacity_per_day);
    const assignable = memberCount > 0 && usedExcl < cap;
    out.push({
      id: row.id,
      name: row.name,
      service_type: row.service_type,
      capacity_per_day: cap,
      member_count: memberCount,
      used_slots_today: usedFull,
      remaining_slots_today: Math.max(0, cap - usedFull),
      assignable,
    });
  }
  return { teams: out, error: null };
}
