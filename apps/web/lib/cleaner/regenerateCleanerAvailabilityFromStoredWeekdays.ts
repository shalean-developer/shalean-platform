import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { replaceCleanerAvailabilityFromWeekly } from "@/lib/admin/replaceCleanerAvailabilityFromWeekly";
import {
  CLEANER_WEEKDAY_CODE_TO_UTC_JS_DAY,
  parseCleanerAvailabilityWeekdaysStrict,
  type CleanerWeekdayCode,
} from "@/lib/cleaner/availabilityWeekdays";
import type { WeeklyScheduleWindow } from "@/lib/booking/weeklyAvailability";

function hmFromCleanerTime(raw: string | null | undefined, fallback: string): string {
  const s = String(raw ?? "").trim();
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s.slice(0, 5);
  return fallback;
}

/**
 * Rebuilds `cleaner_availability` for the next `horizonDays` from `cleaners.availability_weekdays`
 * plus `availability_start` / `availability_end` (same convention as admin “Weekly availability”).
 */
export async function regenerateCleanerAvailabilityFromStoredWeekdays(
  admin: SupabaseClient,
  cleanerId: string,
  opts?: { horizonDays?: number },
): Promise<{ inserted: number }> {
  const { data: row, error } = await admin
    .from("cleaners")
    .select("availability_weekdays, availability_start, availability_end")
    .eq("id", cleanerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Cleaner not found.");

  const codes = parseCleanerAvailabilityWeekdaysStrict(
    (row as { availability_weekdays?: unknown }).availability_weekdays,
  );
  const start = hmFromCleanerTime((row as { availability_start?: string | null }).availability_start, "07:00");
  const end = hmFromCleanerTime((row as { availability_end?: string | null }).availability_end, "18:00");

  const weeklySchedule: WeeklyScheduleWindow[] = codes.map((code) => ({
    day: CLEANER_WEEKDAY_CODE_TO_UTC_JS_DAY[code],
    start,
    end,
  }));

  return replaceCleanerAvailabilityFromWeekly(admin, {
    cleanerId,
    weeklySchedule,
    horizonDays: opts?.horizonDays ?? 60,
  });
}
