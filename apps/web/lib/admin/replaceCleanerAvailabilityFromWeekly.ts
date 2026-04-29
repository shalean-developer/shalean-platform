import type { SupabaseClient } from "@supabase/supabase-js";
import type { WeeklyScheduleWindow } from "@/lib/booking/weeklyAvailability";
import { expandWeeklyScheduleToRows } from "@/lib/booking/weeklyAvailability";

function ymdAddDays(startYmd: string, addDays: number): string {
  const d = new Date(`${startYmd}T12:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return startYmd;
  d.setUTCDate(d.getUTCDate() + addDays);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

/**
 * Replaces `cleaner_availability` rows for `[startYmd, startYmd + horizonDays)` from a weekly template.
 */
export async function replaceCleanerAvailabilityFromWeekly(
  admin: SupabaseClient,
  params: {
    cleanerId: string;
    weeklySchedule: WeeklyScheduleWindow[];
    horizonDays: number;
    startYmd?: string;
  },
): Promise<{ inserted: number }> {
  const horizonDays = Math.min(120, Math.max(7, Math.round(params.horizonDays)));
  const startYmd = (params.startYmd ?? new Date().toISOString().slice(0, 10)).trim();
  const endYmd = ymdAddDays(startYmd, horizonDays - 1);

  const { error: delErr } = await admin
    .from("cleaner_availability")
    .delete()
    .eq("cleaner_id", params.cleanerId)
    .gte("date", startYmd)
    .lte("date", endYmd);
  if (delErr) throw new Error(delErr.message);

  const rows = expandWeeklyScheduleToRows(params.weeklySchedule, startYmd, horizonDays);
  if (rows.length === 0) return { inserted: 0 };

  const CHUNK = 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK).map((r) => ({
      cleaner_id: params.cleanerId,
      date: r.date,
      start_time: r.start_time,
      end_time: r.end_time,
      is_available: r.is_available,
    }));
    const { error } = await admin.from("cleaner_availability").insert(slice);
    if (error) throw new Error(error.message);
    inserted += slice.length;
  }
  return { inserted };
}
