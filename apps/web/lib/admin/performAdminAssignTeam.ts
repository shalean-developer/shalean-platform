import type { SupabaseClient } from "@supabase/supabase-js";
import { assignTeamAndSyncRoster } from "@/lib/booking/assignTeamAndSyncRoster";
import { loadCleanerCapabilityColumnsById } from "@/lib/booking/cleanerServiceCapabilityDb";
import {
  activeRosterHasServiceQualifiedMember,
  cleanerPassesServiceCapabilityGate,
  countCleanersPassingServiceCapabilityGate,
  serviceCapabilityGateFromTeamServiceType,
} from "@/lib/booking/serviceCapabilityEligibility";
import type { TeamMemberAvailabilityRow } from "@/lib/cleaner/teamMemberAvailability";
import { isTeamMemberActiveOnBookingDate } from "@/lib/cleaner/teamMemberAvailability";
import { isTeamService, teamServiceType } from "@/lib/dispatch/assignBooking";
import { isDispatchTeamPoolServiceType } from "@/lib/dispatch/teamServiceTypeDb";
import { CAPACITY_STATUSES } from "@/lib/dispatch/assignTeamToBooking";
import { logSystemEvent } from "@/lib/logging/systemLog";
import {
  buildTeamJobMemberPayoutInsertRows,
  resolveTeamCleanerPoolCents,
} from "@/lib/payout/teamRosterPayoutAllocation";

type BookingRow = {
  id: string;
  date: string | null;
  service: string | null;
  service_slug?: string | null;
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
  if (!isDispatchTeamPoolServiceType(String((team as { service_type?: string }).service_type ?? ""))) {
    return {
      ok: false,
      httpStatus: 400,
      error: "Team must be a deep or move dispatch team (Admin → Teams).",
    };
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

  const activeCleanerIds = [
    ...new Set(
      (memberRows ?? [])
        .filter((row) => {
          const r = row as TeamMemberAvailabilityRow;
          return Boolean(r.cleaner_id && String(r.cleaner_id).trim()) && isTeamMemberActiveOnBookingDate(r, dateYmd);
        })
        .map((row) => String((row as { cleaner_id: string }).cleaner_id).trim()),
    ),
  ].sort();

  const rosterCount = activeCleanerIds.length;
  if (rosterCount <= 0) {
    return { ok: false, httpStatus: 400, error: "Team has no active members on the booking date." };
  }

  const capGate = serviceCapabilityGateFromTeamServiceType(expectedService);
  const capsLoaded = await loadCleanerCapabilityColumnsById(admin, activeCleanerIds);
  if (!capsLoaded.ok) {
    return { ok: false, httpStatus: 500, error: capsLoaded.error };
  }
  if (!activeRosterHasServiceQualifiedMember(activeCleanerIds, capsLoaded.map, capGate)) {
    return {
      ok: false,
      httpStatus: 400,
      error:
        "Team has no member certified for this service on the booking date. Enable `can_do_deep_cleaning` / `can_do_move_cleaning` on at least one active roster cleaner.",
    };
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

  const payoutOwnerCleanerId =
    activeCleanerIds.find((id) => cleanerPassesServiceCapabilityGate(capsLoaded.map.get(id) ?? {}, capGate)) ?? null;
  if (!payoutOwnerCleanerId) {
    return {
      ok: false,
      httpStatus: 400,
      error: "Cannot assign team: no active member on the service date to use as payout owner.",
    };
  }

  const atomic = await assignTeamAndSyncRoster(admin, {
    bookingId,
    teamId: tid,
    payoutOwnerCleanerId,
    teamMemberCountSnapshot: rosterCount,
    variant: "admin",
    source: "admin",
  });
  if (!atomic.ok) {
    const locked = /finalized|roster locked|cleaner line earnings finalized/i.test(atomic.message);
    return { ok: false, httpStatus: locked ? 409 : 500, error: atomic.message };
  }

  const { error: delPayErr } = await admin.from("team_job_member_payouts").delete().eq("booking_id", bookingId);
  if (delPayErr) {
    return { ok: false, httpStatus: 500, error: `Failed clearing payouts: ${delPayErr.message}` };
  }

  const { error: delAssignErr } = await admin.from("booking_team_assignments").delete().eq("booking_id", bookingId);
  if (delAssignErr) {
    return { ok: false, httpStatus: 500, error: `Failed clearing team assignment rows: ${delAssignErr.message}` };
  }

  const poolCents = await resolveTeamCleanerPoolCents(admin, bookingId);
  const { data: rosterRows, error: rosterErr } = await admin
    .from("booking_cleaners")
    .select("cleaner_id, role, payout_weight, lead_bonus_cents")
    .eq("booking_id", bookingId)
    .order("cleaner_id", { ascending: true });
  if (rosterErr) {
    return { ok: false, httpStatus: 500, error: `Failed loading roster for payout split: ${rosterErr.message}` };
  }

  const payoutRows = buildTeamJobMemberPayoutInsertRows({
    bookingId,
    teamId: tid,
    poolCents,
    rosterRows: rosterRows ?? [],
    fallbackCleanerIds: activeCleanerIds,
  });
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
  /** Distinct cleaners active on the booking date (membership window). */
  active_member_count: number;
  /** Subset of active cleaners who pass the deep/move capability gate for this booking. */
  qualified_member_count: number;
  /**
   * Same as `qualified_member_count` (assignment-eligible headcount).
   * Kept for older clients that only read `member_count`.
   */
  member_count: number;
  used_slots_today: number;
  remaining_slots_today: number;
  /** False when no qualified active cleaner or no spare day slot for this booking to land on this team. */
  assignable: boolean;
  /** False when the team row is inactive — still listed so admins can see and re-enable in Teams admin. */
  team_active: boolean;
};

function activeCleanerIdsSortedOnDate(members: TeamMemberAvailabilityRow[], dateYmd: string): string[] {
  return [
    ...new Set(
      members
        .filter(
          (m) =>
            isTeamMemberActiveOnBookingDate(m, dateYmd) &&
            m.cleaner_id != null &&
            String(m.cleaner_id).trim() !== "",
        )
        .map((m) => String(m.cleaner_id).trim()),
    ),
  ].sort();
}

function teamQualifiedForDisplayLabel(st: "deep_cleaning" | "move_cleaning"): string {
  return st === "move_cleaning" ? "move cleaning" : "deep cleaning";
}

export type ListTeamAssignCandidatesResult = {
  teams: TeamAssignCandidateRow[];
  error: string | null;
  /** Human label for the capability gate (e.g. “move cleaning”) when `teams` is for a team-service booking. */
  qualified_for_label: string;
};

export async function listTeamAssignCandidatesForBooking(
  admin: SupabaseClient,
  booking: Pick<BookingRow, "service" | "booking_snapshot" | "date" | "id" | "service_slug">,
): Promise<ListTeamAssignCandidatesResult> {
  if (!isTeamService(booking as BookingRow)) {
    return { teams: [], error: null, qualified_for_label: "" };
  }
  const dateYmd = String(booking.date ?? "").trim();
  const st = teamServiceType(booking as BookingRow);
  const qualifiedLabel = teamQualifiedForDisplayLabel(st);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
    return { teams: [], error: "Booking date invalid.", qualified_for_label: qualifiedLabel };
  }
  const capGate = serviceCapabilityGateFromTeamServiceType(st);

  const { data: teamsRaw, error: tErr } = await admin
    .from("teams")
    .select("id, name, service_type, capacity_per_day, is_active")
    .order("name", { ascending: true })
    .limit(250);
  if (tErr) return { teams: [], error: tErr.message, qualified_for_label: qualifiedLabel };

  const teamRows = ((teamsRaw ?? []) as Array<{
    id: string;
    name: string;
    service_type: string;
    capacity_per_day: number;
    is_active?: boolean | null;
  }>).filter((row) => isDispatchTeamPoolServiceType(row.service_type));
  const teamIds = teamRows.map((t) => String(t.id).trim()).filter(Boolean);

  const membersByTeam = new Map<string, TeamMemberAvailabilityRow[]>();
  if (teamIds.length > 0) {
    const { data: allMembers, error: mErr } = await admin
      .from("team_members")
      .select("team_id, cleaner_id, active_from, active_to")
      .in("team_id", teamIds)
      .not("cleaner_id", "is", null);
    if (mErr) return { teams: [], error: mErr.message, qualified_for_label: qualifiedLabel };
    for (const raw of allMembers ?? []) {
      const tid = String((raw as { team_id?: string }).team_id ?? "").trim();
      if (!tid) continue;
      const row = raw as TeamMemberAvailabilityRow;
      const list = membersByTeam.get(tid);
      if (list) list.push(row);
      else membersByTeam.set(tid, [row]);
    }
  }

  const allActiveCleanerIds = new Set<string>();
  for (const arr of membersByTeam.values()) {
    for (const id of activeCleanerIdsSortedOnDate(arr, dateYmd)) {
      allActiveCleanerIds.add(id);
    }
  }
  const capsLoaded = await loadCleanerCapabilityColumnsById(admin, [...allActiveCleanerIds]);
  if (!capsLoaded.ok) return { teams: [], error: capsLoaded.error, qualified_for_label: qualifiedLabel };

  const out: TeamAssignCandidateRow[] = [];
  for (const row of teamRows) {
    const members = membersByTeam.get(row.id) ?? [];
    const activeCleanerIds = activeCleanerIdsSortedOnDate(members, dateYmd);
    const activeCount = activeCleanerIds.length;
    const qualifiedCount = countCleanersPassingServiceCapabilityGate(activeCleanerIds, capsLoaded.map, capGate);
    const { count: usedFull } = await countTeamJobSlotsUsedOnDate(admin, row.id, dateYmd);
    const { count: usedExcl } = await countTeamJobSlotsUsedOnDate(admin, row.id, dateYmd, booking.id);
    const cap = teamDayCapacitySlots(row.capacity_per_day);
    const teamActive = row.is_active !== false;
    const assignable = teamActive && qualifiedCount > 0 && usedExcl < cap;
    out.push({
      id: row.id,
      name: row.name,
      service_type: row.service_type,
      capacity_per_day: cap,
      active_member_count: activeCount,
      qualified_member_count: qualifiedCount,
      member_count: qualifiedCount,
      used_slots_today: usedFull,
      remaining_slots_today: Math.max(0, cap - usedFull),
      assignable,
      team_active: teamActive,
    });
  }
  return { teams: out, error: null, qualified_for_label: qualifiedLabel };
}
