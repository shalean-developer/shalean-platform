import { johannesburgCalendarYmd } from "@/lib/dashboard/johannesburgMonth";
import { addDaysYmd, isoWeekdayFromYmd } from "@/lib/recurring/johannesburgCalendar";

export type EarningsPeriodRowInput = {
  completed_at: string | null;
  amount_cents: number;
};

function johannesburgYmdFromCompletedAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  return johannesburgCalendarYmd(t);
}

/**
 * Sum `amount_cents` for completed earnings rows by Johannesburg calendar
 * (completion instant → local YMD vs today / ISO week / calendar month).
 */
export function earningsPeriodCentsFromRows(rows: EarningsPeriodRowInput[], now = new Date()): {
  today_cents: number;
  week_cents: number;
  month_cents: number;
} {
  const todayY = johannesburgCalendarYmd(now);
  const iso = isoWeekdayFromYmd(todayY);
  const weekStart = addDaysYmd(todayY, -(iso - 1));
  const monthPrefix = todayY.slice(0, 7);

  let todayC = 0;
  let weekC = 0;
  let monthC = 0;

  for (const r of rows) {
    const d = johannesburgYmdFromCompletedAt(r.completed_at);
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const c = Math.max(0, Math.round(Number(r.amount_cents) || 0));
    if (d === todayY) todayC += c;
    if (d >= weekStart && d <= todayY) weekC += c;
    if (d.slice(0, 7) === monthPrefix) monthC += c;
  }

  return { today_cents: todayC, week_cents: weekC, month_cents: monthC };
}
