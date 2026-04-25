import type { SupabaseClient } from "@supabase/supabase-js";

export type BookingAccessRow = {
  cleaner_id?: string | null;
  team_id?: string | null;
  is_team_job?: boolean | null;
};

/** Distinct team IDs this cleaner belongs to (active membership rows). */
export async function fetchCleanerTeamIds(admin: SupabaseClient, cleanerId: string): Promise<string[]> {
  const { data, error } = await admin
    .from("team_members")
    .select("team_id")
    .eq("cleaner_id", cleanerId)
    .not("team_id", "is", null);
  if (error || !data?.length) return [];
  const ids = new Set<string>();
  for (const raw of data) {
    const tid = String((raw as { team_id?: string | null }).team_id ?? "").trim();
    if (tid) ids.add(tid);
  }
  return [...ids];
}

/**
 * PostgREST `.or()` expression for bookings the cleaner may see:
 * assigned to them individually OR team job on a team they belong to.
 */
export function bookingsVisibilityOrFilter(cleanerId: string, teamIds: string[]): string {
  const c = cleanerId.trim();
  if (!c) return `cleaner_id.eq.${c}`;
  const list = teamIds.map((t) => t.trim()).filter(Boolean);
  if (!list.length) return `cleaner_id.eq.${c}`;
  return `cleaner_id.eq.${c},and(is_team_job.is.true,team_id.in.(${list.join(",")}))`;
}

export async function cleanerHasBookingAccess(
  admin: SupabaseClient,
  cleanerId: string,
  row: BookingAccessRow,
): Promise<boolean> {
  if (String(row.cleaner_id ?? "").trim() === cleanerId.trim()) return true;
  if (row.is_team_job !== true) return false;
  const teamId = String(row.team_id ?? "").trim();
  if (!teamId) return false;
  const { data, error } = await admin
    .from("team_members")
    .select("team_id")
    .eq("team_id", teamId)
    .eq("cleaner_id", cleanerId)
    .maybeSingle();
  return !error && data != null;
}
