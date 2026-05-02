import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { earningsPeriodBucketYmd } from "@/lib/cleaner/cleanerEarningsPeriodTotals";
import { cleanerFacingDisplayEarningsCents } from "@/lib/cleaner/cleanerMobileBookingMap";
import { johannesburgCalendarYmd } from "@/lib/dashboard/johannesburgMonth";
import { addDaysYmd, isoWeekdayFromYmd } from "@/lib/recurring/johannesburgCalendar";

/** Completed bookings (any pay state) whose completion instant falls on today’s JHB calendar date. */
export function completedJobCountTodayJohannesburg(rows: CleanerBookingRow[], now = new Date()): number {
  const todayY = johannesburgCalendarYmd(now);
  let n = 0;
  for (const r of rows) {
    if (String(r.status ?? "").toLowerCase() !== "completed") continue;
    const d = earningsPeriodBucketYmd({ completed_at: r.completed_at, schedule_date: r.date });
    if (d === todayY) n += 1;
  }
  return n;
}

/**
 * Sum resolved cleaner cents for **completed** jobs by Johannesburg calendar (same week boundaries as
 * {@link earningsPeriodCentsFromRows} / earnings API period logic).
 */
export function completedJobEarningsPeriodFromRows(rows: CleanerBookingRow[], now = new Date()): {
  todayCents: number;
  weekCents: number;
} {
  const todayY = johannesburgCalendarYmd(now);
  const iso = isoWeekdayFromYmd(todayY);
  const weekStart = addDaysYmd(todayY, -(iso - 1));

  let todayC = 0;
  let weekC = 0;

  for (const r of rows) {
    if (String(r.status ?? "").toLowerCase() !== "completed") continue;
    const d = earningsPeriodBucketYmd({ completed_at: r.completed_at, schedule_date: r.date });
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const cents = cleanerFacingDisplayEarningsCents(r);
    if (cents == null || cents <= 0) continue;
    if (d === todayY) todayC += cents;
    if (d >= weekStart && d <= todayY) weekC += cents;
  }

  return { todayCents: todayC, weekCents: weekC };
}
