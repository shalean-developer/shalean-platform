import type { SupabaseClient } from "@supabase/supabase-js";

/** Max team-service bookings per calendar day across the whole platform (any mix of deep / move). */
export const MAX_TEAM_BOOKINGS_PER_DAY = 3;

/** Max team jobs assignable to a single team on one calendar day. */
export const TEAM_JOBS_PER_TEAM_PER_DAY = 1;

/** Minimum active roster members required before a team can take a job. */
export const TEAM_MIN_ROSTER_MEMBERS = 2;

/** Maximum roster members admins may add to a team. */
export const TEAM_MAX_ROSTER_MEMBERS = 15;

/** @deprecated Use {@link TEAM_JOBS_PER_TEAM_PER_DAY}. */
export const TEAM_JOBS_PER_DAY = TEAM_JOBS_PER_TEAM_PER_DAY;

/** Statuses that consume a team-day slot — keep aligned with `assignTeamToBooking` / `claim_team_capacity_slot`. */
export const TEAM_CAPACITY_CONSUMING_STATUSES = ["pending", "assigned", "in_progress"] as const;

const CAPACITY_CONSUMING_STATUSES = TEAM_CAPACITY_CONSUMING_STATUSES;

export function teamJobSlotsPerTeamPerDay(): number {
  return TEAM_JOBS_PER_TEAM_PER_DAY;
}

/** @deprecated Use {@link teamJobSlotsPerTeamPerDay}. */
export function teamJobSlotsPerDay(): number {
  return teamJobSlotsPerTeamPerDay();
}

export function clampTeamRosterCapacity(value: number | null | undefined): number {
  const n = Math.floor(Number(value ?? TEAM_MAX_ROSTER_MEMBERS));
  if (!Number.isFinite(n)) return TEAM_MAX_ROSTER_MEMBERS;
  return Math.min(TEAM_MAX_ROSTER_MEMBERS, Math.max(TEAM_MIN_ROSTER_MEMBERS, n));
}

/** Authoritative team-day slot usage (`claim_team_capacity_slot` / `release_team_capacity_slot`). */
export async function fetchTeamCapacityUsageSlotsByTeam(
  admin: SupabaseClient,
  dateYmd: string,
  teamIds: string[],
): Promise<{ map: Map<string, number>; error: string | null }> {
  if (teamIds.length === 0) return { map: new Map(), error: null };
  const { data, error } = await admin
    .from("team_daily_capacity_usage")
    .select("team_id, used_slots")
    .eq("booking_date", dateYmd)
    .in("team_id", teamIds);
  if (error) return { map: new Map(), error: error.message };
  const map = new Map<string, number>();
  for (const row of data ?? []) {
    const tid = String((row as { team_id?: string | null }).team_id ?? "").trim();
    if (!tid) continue;
    const n = Math.floor(Number((row as { used_slots?: number | null }).used_slots ?? 0));
    map.set(tid, Number.isFinite(n) && n > 0 ? n : 0);
  }
  return { map, error: null };
}

export function aggregateTeamJobsByTeamId(rows: { team_id?: string | null }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const tid = String(row.team_id ?? "").trim();
    if (!tid) continue;
    map.set(tid, (map.get(tid) ?? 0) + 1);
  }
  return map;
}

/** Team jobs scheduled on `dateYmd` that still consume capacity (pending / assigned / in_progress). */
export async function countTeamJobsScheduledOnDateByTeam(
  admin: SupabaseClient,
  dateYmd: string,
  teamIds: string[],
): Promise<{ map: Map<string, number>; error: string | null }> {
  if (teamIds.length === 0) return { map: new Map(), error: null };
  const { data, error } = await admin
    .from("bookings")
    .select("team_id")
    .eq("date", dateYmd)
    .eq("is_team_job", true)
    .in("team_id", teamIds)
    .in("status", [...CAPACITY_CONSUMING_STATUSES])
    .not("team_id", "is", null);
  if (error) return { map: new Map(), error: error.message };
  return { map: aggregateTeamJobsByTeamId((data ?? []) as { team_id?: string | null }[]), error: null };
}

/** Prefer the higher of scheduled jobs vs claimed usage slots (guards allocator / RPC drift). */
export function teamDayJobsForMetrics(
  scheduledByTeam: Map<string, number>,
  usageByTeam: Map<string, number>,
  teamId: string,
): number {
  return Math.max(scheduledByTeam.get(teamId) ?? 0, usageByTeam.get(teamId) ?? 0);
}

export async function countPlatformTeamJobsOnDate(
  admin: SupabaseClient,
  dateYmd: string,
  excludeBookingId?: string,
): Promise<{ count: number; error: string | null }> {
  let q = admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("date", dateYmd)
    .eq("is_team_job", true)
    .in("status", [...CAPACITY_CONSUMING_STATUSES]);
  if (excludeBookingId) {
    q = q.neq("id", excludeBookingId);
  }
  const { count, error } = await q;
  if (error) return { count: 0, error: error.message };
  return { count: count ?? 0, error: null };
}
