import type { SupabaseClient } from "@supabase/supabase-js";
import {
  activeRosterHasServiceQualifiedMember,
  countCleanersPassingServiceCapabilityGate,
  type ServiceCapabilityGate,
} from "@/lib/booking/serviceCapabilityEligibility";
import { loadCleanerCapabilityColumnsById } from "@/lib/booking/cleanerServiceCapabilityDb";
import { isTeamMemberActiveOnBookingDate } from "@/lib/cleaner/teamMemberAvailability";
import {
  countPlatformTeamJobsOnDate,
  fetchTeamCapacityUsageSlotsByTeam,
  MAX_TEAM_BOOKINGS_PER_DAY,
  TEAM_MIN_ROSTER_MEMBERS,
} from "@/lib/dispatch/teamJobsPerDay";
import { isDispatchTeamPoolServiceType } from "@/lib/dispatch/teamServiceTypeDb";

export type DispatchTeamAvailabilityRow = {
  id: string;
  name: string;
  service_type: string;
  /** Team can accept another job on `dateYmd` (roster + platform cap + per-team slot). */
  available: boolean;
  active_member_count: number;
  qualified_member_count: number;
};

const TEAM_BOOKING_RESERVATION_STATUSES = [
  "pending",
  "pending_payment",
  "assigned",
  "in_progress",
  "confirmed",
] as const;

function capabilityGateFromBookingV2Slug(serviceSlug: string): ServiceCapabilityGate {
  return String(serviceSlug ?? "").trim().toLowerCase() === "moving-cleaning" ? "move" : "deep";
}

/** Bookings that reserve a team-day slot before or after `team_id` is set. */
async function loadTeamSlotUsageByTeamOnDate(
  admin: SupabaseClient,
  dateYmd: string,
): Promise<{ map: Map<string, number>; error: string | null }> {
  const { data, error } = await admin
    .from("bookings")
    .select("team_id, assigned_team_id, is_team_job, status")
    .eq("date", dateYmd)
    .in("status", [...TEAM_BOOKING_RESERVATION_STATUSES]);
  if (error) return { map: new Map(), error: error.message };

  const map = new Map<string, number>();
  for (const raw of data ?? []) {
    const row = raw as {
      team_id?: string | null;
      assigned_team_id?: string | null;
      is_team_job?: boolean | null;
      status?: string | null;
    };
    const st = String(row.status ?? "").toLowerCase();
    if (st === "cancelled" || st === "payment_expired") continue;
    const tid = String(row.is_team_job ? row.team_id : row.assigned_team_id ?? row.team_id ?? "")
      .trim();
    if (!tid) continue;
    map.set(tid, (map.get(tid) ?? 0) + 1);
  }
  return { map, error: null };
}

/**
 * Active dispatch teams from `public.teams` for deep / move booking flows.
 * Replaces legacy hard-coded booking-v2 `TEAMS` placeholders.
 */
export async function loadDispatchTeamsForBooking(
  admin: SupabaseClient,
  opts: {
    dateYmd: string;
    serviceSlug: string;
  },
): Promise<{ teams: DispatchTeamAvailabilityRow[]; platformAtCapacity: boolean; error: string | null }> {
  const dateYmd = String(opts.dateYmd ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
    return { teams: [], platformAtCapacity: false, error: "Invalid date." };
  }

  const capGate = capabilityGateFromBookingV2Slug(opts.serviceSlug);

  const { data: teamsRaw, error: tErr } = await admin
    .from("teams")
    .select("id, name, service_type, capacity_per_day, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(250);
  if (tErr) return { teams: [], platformAtCapacity: false, error: tErr.message };

  const teamRows = (teamsRaw ?? []).filter((row) =>
    isDispatchTeamPoolServiceType(String((row as { service_type?: string }).service_type ?? "")),
  );
  const teamIds = teamRows.map((t) => String((t as { id?: string }).id ?? "").trim()).filter(Boolean);
  if (teamIds.length === 0) {
    return { teams: [], platformAtCapacity: false, error: null };
  }

  const membersByTeam = new Map<
    string,
    { cleaner_id?: string | null; active_from?: string | null; active_to?: string | null }[]
  >();
  const { data: memberRows, error: mErr } = await admin
    .from("team_members")
    .select("team_id, cleaner_id, active_from, active_to")
    .in("team_id", teamIds)
    .not("cleaner_id", "is", null);
  if (mErr) return { teams: [], platformAtCapacity: false, error: mErr.message };
  for (const raw of memberRows ?? []) {
    const tid = String((raw as { team_id?: string }).team_id ?? "").trim();
    if (!tid) continue;
    const list = membersByTeam.get(tid);
    if (list) list.push(raw as { cleaner_id?: string | null; active_from?: string | null; active_to?: string | null });
    else membersByTeam.set(tid, [raw as { cleaner_id?: string | null; active_from?: string | null; active_to?: string | null }]);
  }

  const allActiveCleanerIds = new Set<string>();
  for (const members of membersByTeam.values()) {
    for (const m of members) {
      if (!m.cleaner_id || !String(m.cleaner_id).trim()) continue;
      if (!isTeamMemberActiveOnBookingDate(m, dateYmd)) continue;
      allActiveCleanerIds.add(String(m.cleaner_id).trim());
    }
  }
  const capsLoaded = await loadCleanerCapabilityColumnsById(admin, [...allActiveCleanerIds]);
  if (!capsLoaded.ok) return { teams: [], platformAtCapacity: false, error: capsLoaded.error };

  const { count: platformUsed, error: platformErr } = await countPlatformTeamJobsOnDate(admin, dateYmd);
  if (platformErr) return { teams: [], platformAtCapacity: false, error: platformErr };
  const platformAtCapacity = platformUsed >= MAX_TEAM_BOOKINGS_PER_DAY;

  const usageLoaded = await fetchTeamCapacityUsageSlotsByTeam(admin, dateYmd, teamIds);
  if (usageLoaded.error) return { teams: [], platformAtCapacity, error: usageLoaded.error };

  const reservedLoaded = await loadTeamSlotUsageByTeamOnDate(admin, dateYmd);
  if (reservedLoaded.error) return { teams: [], platformAtCapacity, error: reservedLoaded.error };

  const out: DispatchTeamAvailabilityRow[] = [];
  for (const row of teamRows) {
    const id = String((row as { id?: string }).id ?? "").trim();
    const members = membersByTeam.get(id) ?? [];
    const activeCleanerIds = members
      .filter((m) => m.cleaner_id && isTeamMemberActiveOnBookingDate(m, dateYmd))
      .map((m) => String(m.cleaner_id).trim());
    const activeCount = activeCleanerIds.length;
    const qualifiedCount = countCleanersPassingServiceCapabilityGate(
      activeCleanerIds,
      capsLoaded.map,
      capGate,
    );
    const rosterOk =
      activeCount >= TEAM_MIN_ROSTER_MEMBERS &&
      activeRosterHasServiceQualifiedMember(activeCleanerIds, capsLoaded.map, capGate);
    const usedSlots = Math.max(
      reservedLoaded.map.get(id) ?? 0,
      usageLoaded.map.get(id) ?? 0,
    );
    const teamHasCapacity = usedSlots < 1;
    const available = rosterOk && !platformAtCapacity && teamHasCapacity;
    out.push({
      id,
      name: String((row as { name?: string }).name ?? "Team").trim() || "Team",
      service_type: String((row as { service_type?: string }).service_type ?? ""),
      available,
      active_member_count: activeCount,
      qualified_member_count: qualifiedCount,
    });
  }

  return { teams: out, platformAtCapacity, error: null };
}
