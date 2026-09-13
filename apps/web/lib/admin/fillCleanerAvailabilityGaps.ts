import type { SupabaseClient } from "@supabase/supabase-js";

import {
  CLEANER_WEEKDAY_CODE_TO_UTC_JS_DAY,
  parseCleanerAvailabilityWeekdaysStrict,
} from "@/lib/cleaner/availabilityWeekdays";

/**
 * Ensures each cleaner with legacy `availability_start` / `availability_end` has calendar rows
 * for the next `horizonDays` when a date has no row yet (idempotent).
 *
 * `cleaners.availability_weekdays` is the source of truth for which weekdays may be generated.
 * A cleaner with no stored weekdays gets no generated availability rows. Existing rows are not
 * overwritten here so explicit one-off availability/unavailability overrides remain intact.
 */
export async function fillCleanerAvailabilityGapsFromLegacyColumns(
  admin: SupabaseClient,
  horizonDays = 45,
): Promise<{ inserted: number }> {
  const { data: cleaners, error } = await admin
    .from("cleaners")
    .select("id, availability_start, availability_end, availability_weekdays")
    .not("availability_start", "is", null)
    .not("availability_end", "is", null);
  if (error) throw new Error(error.message);

  const start = new Date();
  let inserted = 0;

  for (const raw of cleaners ?? []) {
    const c = raw as {
      id?: string;
      availability_start?: string | null;
      availability_end?: string | null;
      availability_weekdays?: unknown;
    };
    const id = String(c.id ?? "");
    if (!id) continue;
    const startT = c.availability_start;
    const endT = c.availability_end;
    if (!startT || !endT) continue;

    const weekdayCodes = parseCleanerAvailabilityWeekdaysStrict(c.availability_weekdays);
    if (weekdayCodes.length === 0) continue;
    const allowedUtcDays = new Set(
      weekdayCodes.map((code) => CLEANER_WEEKDAY_CODE_TO_UTC_JS_DAY[code]),
    );

    const startHm = String(startT).slice(0, 5);
    const endHm = String(endT).slice(0, 5);
    if (!/^\d{2}:\d{2}$/.test(startHm) || !/^\d{2}:\d{2}$/.test(endHm)) continue;

    for (let i = 0; i < horizonDays; i += 1) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      if (!allowedUtcDays.has(d.getUTCDay())) continue;

      const y = d.getUTCFullYear();
      const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
      const da = String(d.getUTCDate()).padStart(2, "0");
      const dateStr = `${y}-${mo}-${da}`;

      const { count } = await admin
        .from("cleaner_availability")
        .select("id", { count: "exact", head: true })
        .eq("cleaner_id", id)
        .eq("date", dateStr);

      if ((count ?? 0) > 0) continue;

      const { error: insErr } = await admin.from("cleaner_availability").insert({
        cleaner_id: id,
        date: dateStr,
        start_time: startHm,
        end_time: endHm,
        is_available: true,
      });
      if (!insErr) inserted += 1;
    }
  }

  return { inserted };
}
