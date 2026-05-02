import { johannesburgCalendarYmd } from "@/lib/dashboard/johannesburgMonth";
import { addDaysYmd, isoWeekdayFromYmd } from "@/lib/recurring/johannesburgCalendar";

/** Monday `YYYY-MM-DD` of the ISO week (Mon–Sun) containing `now` in Africa/Johannesburg. */
export function getJhbIsoWeekStartYmd(now: Date = new Date()): string {
  const todayY = johannesburgCalendarYmd(now);
  const iso = isoWeekdayFromYmd(todayY);
  return addDaysYmd(todayY, -(iso - 1));
}

/**
 * Current ISO week (Mon–Sun) in Johannesburg civil calendar.
 * `start` / `end` are wall-time instants in SAST (+02:00, no DST).
 */
export function getJhbWeekBounds(now: Date = new Date()): {
  startYmd: string;
  endYmd: string;
  start: Date;
  end: Date;
} {
  const startYmd = getJhbIsoWeekStartYmd(now);
  const endYmd = addDaysYmd(startYmd, 6);
  const start = new Date(`${startYmd}T00:00:00+02:00`);
  const end = new Date(`${endYmd}T23:59:59.999+02:00`);
  return { startYmd, endYmd, start, end };
}
