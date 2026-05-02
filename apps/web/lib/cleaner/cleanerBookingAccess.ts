import type { SupabaseClient } from "@supabase/supabase-js";

export type BookingAccessRow = {
  /** Booking id — enables roster membership checks via `booking_cleaners`. */
  id?: string | null;
  cleaner_id?: string | null;
  payout_owner_cleaner_id?: string | null;
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
 * assigned solo cleaner, payroll owner (team / admin paths), OR team job on a team they belong to.
 */
/**
 * Booking ids where the cleaner appears on `booking_cleaners` (for PostgREST `.or()` visibility).
 */
export async function fetchBookingIdsWhereCleanerOnRoster(
  admin: SupabaseClient,
  cleanerId: string,
  limit = 500,
): Promise<string[]> {
  const { data, error } = await admin
    .from("booking_cleaners")
    .select("booking_id")
    .eq("cleaner_id", cleanerId)
    .limit(limit);
  if (error || !data?.length) return [];
  const out = new Set<string>();
  for (const raw of data) {
    const id = String((raw as { booking_id?: string | null }).booking_id ?? "").trim();
    if (id) out.add(id);
  }
  return [...out];
}

/** Append `id.in.(...)` for roster-only bookings to a PostgREST `.or()` filter string. */
export function appendRosterBookingIdsToOrFilter(baseOr: string, bookingIds: readonly string[]): string {
  const ids = [...new Set(bookingIds.map((x) => String(x ?? "").trim()).filter(Boolean))];
  if (!ids.length) return baseOr;
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const safe = ids.filter((id) => uuidRe.test(id));
  if (!safe.length) return baseOr;
  return `${baseOr},id.in.(${safe.join(",")})`;
}

export function bookingsVisibilityOrFilter(cleanerId: string, teamIds: string[]): string {
  const c = cleanerId.trim();
  if (!c) return `cleaner_id.eq.${c}`;
  const soloOrOwner = `cleaner_id.eq.${c},payout_owner_cleaner_id.eq.${c}`;
  const list = teamIds.map((t) => t.trim()).filter(Boolean);
  if (!list.length) return soloOrOwner;
  return `${soloOrOwner},and(is_team_job.is.true,team_id.in.(${list.join(",")}))`;
}

/**
 * PostgREST `.or(...)` filter for every booking a cleaner may see (solo, payout owner, team, roster).
 * Use from `/api/cleaner/jobs`, `/api/cleaner/dashboard`, and anywhere else visibility must stay aligned.
 */
export async function getCleanerVisibleBookingsOrFilter(
  admin: SupabaseClient,
  cleanerId: string,
): Promise<{ orFilter: string }> {
  const teamIds = await fetchCleanerTeamIds(admin, cleanerId);
  const rosterBookingIds = await fetchBookingIdsWhereCleanerOnRoster(admin, cleanerId);
  const orFilter = appendRosterBookingIdsToOrFilter(bookingsVisibilityOrFilter(cleanerId, teamIds), rosterBookingIds);
  return { orFilter };
}

export async function cleanerHasBookingAccess(
  admin: SupabaseClient,
  cleanerId: string,
  row: BookingAccessRow,
): Promise<boolean> {
  if (String(row.cleaner_id ?? "").trim() === cleanerId.trim()) return true;
  if (String(row.payout_owner_cleaner_id ?? "").trim() === cleanerId.trim()) return true;
  const bid = String(row.id ?? "").trim();
  if (bid) {
    const { data: rosterHit, error: rosterErr } = await admin
      .from("booking_cleaners")
      .select("id")
      .eq("booking_id", bid)
      .eq("cleaner_id", cleanerId)
      .maybeSingle();
    if (!rosterErr && rosterHit) return true;
  }
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
