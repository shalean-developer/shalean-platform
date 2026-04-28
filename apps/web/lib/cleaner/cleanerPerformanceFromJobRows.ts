import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { cleanerFacingDisplayEarningsCents } from "@/lib/cleaner/cleanerMobileBookingMap";
import { johannesburgCalendarYmd } from "@/lib/dashboard/johannesburgMonth";
import { addDaysYmd, isoWeekdayFromYmd } from "@/lib/recurring/johannesburgCalendar";

function jhbYmdFromCompletedAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  return johannesburgCalendarYmd(t);
}

/** Completed bookings (any pay state) whose completion instant falls on today’s JHB calendar date. */
export function completedJobCountTodayJohannesburg(rows: CleanerBookingRow[], now = new Date()): number {
  const todayY = johannesburgCalendarYmd(now);
  let n = 0;
  for (const r of rows) {
    if (String(r.status ?? "").toLowerCase() !== "completed") continue;
    const d = jhbYmdFromCompletedAt(r.completed_at);
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
    const d = jhbYmdFromCompletedAt(r.completed_at);
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const cents = cleanerFacingDisplayEarningsCents(r);
    if (cents == null || cents <= 0) continue;
    if (d === todayY) todayC += cents;
    if (d >= weekStart && d <= todayY) weekC += cents;
  }

  return { todayCents: todayC, weekCents: weekC };
}
