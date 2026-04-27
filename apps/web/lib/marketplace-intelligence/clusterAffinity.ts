import type { SupabaseClient } from "@supabase/supabase-js";

function hourPrefixFromHm(timeHm: string): string {
  const s = String(timeHm).trim().slice(0, 5);
  if (/^\d{2}:\d{2}$/.test(s)) return s.slice(0, 2);
  const m = /^(\d{1,2}):/.exec(s);
  return m ? String(Math.min(23, parseInt(m[1]!, 10))).padStart(2, "0") : "00";
}

/**
 * Boost when cleaner already has work same day, same area, same clock-hour bucket (cluster proxy).
 * Does not require `marketplace_cluster_id` to be backfilled on older rows.
 */
export async function sameClusterDayAffinityBoost(
  supabase: SupabaseClient,
  params: {
    cleanerId: string;
    dateYmd: string;
    timeHm: string;
    locationId: string;
    excludeBookingId?: string;
  },
): Promise<number> {
  const hh = hourPrefixFromHm(params.timeHm);
  let q = supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("date", params.dateYmd)
    .eq("cleaner_id", params.cleanerId)
    .eq("location_id", params.locationId)
    .like("time", `${hh}:%`)
    .in("status", ["assigned", "in_progress"]);
  if (params.excludeBookingId) {
    q = q.neq("id", params.excludeBookingId);
  }
  const { count, error } = await q;
  if (error) return 0;
  const n = count ?? 0;
  if (n <= 0) return 0;
  return Math.min(2.2, 0.85 + n * 0.4);
}
