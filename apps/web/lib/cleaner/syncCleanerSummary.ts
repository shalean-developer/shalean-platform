import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  CLEANER_WEEKDAY_CODES,
  type CleanerWeekdayCode,
  weekdayCodeFromYmdJohannesburg,
} from "@/lib/cleaner/availabilityWeekdays";
import { johannesburgCalendarYmd, johannesburgCalendarYmdAddDays } from "@/lib/dashboard/johannesburgMonth";

const SUMMARY_HORIZON_DAYS = 120;

type LocationJoinRow = {
  location_id?: string;
  locations?: { id?: string; name?: string | null; city_id?: string | null; slug?: string | null } | null;
};

/**
 * Derives `cleaners.location`, `location_id` / `city_id`, and `availability_weekdays` from
 * canonical `cleaner_locations` + `cleaner_availability` (JHB calendar window for availability).
 *
 * - Empty `cleaner_locations` clears `location`, `location_id`, and `city_id` so the dashboard
 *   matches admin “no working areas”.
 * - No future available rows in the JHB window sets `availability_weekdays` to `[]`.
 */
export async function syncCleanerSummary(admin: SupabaseClient, cleanerId: string, now = new Date()): Promise<void> {
  const { data: locRows, error: locErr } = await admin
    .from("cleaner_locations")
    .select("location_id, locations(id, name, city_id, slug)")
    .eq("cleaner_id", cleanerId);
  if (locErr) throw new Error(locErr.message);

  const joined = (locRows ?? []) as LocationJoinRow[];
  const withLoc = joined
    .map((r) => {
      const loc = r.locations;
      const id = String(loc?.id ?? r.location_id ?? "").trim();
      const name = String(loc?.name ?? "").trim();
      if (!id || !name) return null;
      return {
        id,
        name,
        city_id: loc?.city_id != null && String(loc.city_id).trim() ? String(loc.city_id).trim() : null,
        slug: String(loc?.slug ?? "").trim(),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  const updates: Record<string, unknown> = {};

  if (withLoc.length > 0) {
    updates.location = withLoc.map((x) => x.name).join(", ");
    const primary = withLoc[0]!;
    updates.location_id = primary.id;
    if (primary.city_id) {
      updates.city_id = primary.city_id;
    }
  } else {
    updates.location = null;
    updates.location_id = null;
    updates.city_id = null;
  }

  const todayJhb = johannesburgCalendarYmd(now);
  const endYmd = johannesburgCalendarYmdAddDays(todayJhb, SUMMARY_HORIZON_DAYS);
  const { data: avRows, error: avErr } = await admin
    .from("cleaner_availability")
    .select("date")
    .eq("cleaner_id", cleanerId)
    .eq("is_available", true)
    .gte("date", todayJhb)
    .lte("date", endYmd);
  if (avErr) throw new Error(avErr.message);

  if (Array.isArray(avRows) && avRows.length > 0) {
    const codes = new Set<CleanerWeekdayCode>();
    for (const r of avRows) {
      const d = String((r as { date?: string }).date ?? "").slice(0, 10);
      const c = weekdayCodeFromYmdJohannesburg(d);
      if (c) codes.add(c);
    }
    updates.availability_weekdays = CLEANER_WEEKDAY_CODES.filter((x) => codes.has(x));
  } else {
    updates.availability_weekdays = [];
  }

  const { error: upErr } = await admin.from("cleaners").update(updates).eq("id", cleanerId);
  if (upErr) throw new Error(upErr.message);
}
