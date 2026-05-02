import { johannesburgCalendarYmd } from "@/lib/dashboard/johannesburgMonth";
import { addDaysYmd, isoWeekdayFromYmd } from "@/lib/recurring/johannesburgCalendar";

/** Fields used only to map a row to a Johannesburg calendar day (no cents). */
export type EarningsPeriodBucketInput = {
  completed_at: string | null;
  /**
   * `bookings.date` (service / wall day, `YYYY-MM-DD`) — used only when `completed_at` is null
   * so period totals are not blank for legacy rows.
   */
  schedule_date?: string | null;
};

export type EarningsPeriodRowInput = EarningsPeriodBucketInput & {
  amount_cents: number;
};

/** Civil `YYYY-MM-DD` in Johannesburg for a completion timestamp, or civil date-only string as-is. */
export function johannesburgYmdFromCompletionField(isoOrYmd: string | null | undefined): string | null {
  if (!isoOrYmd) return null;
  const s = String(isoOrYmd).trim();
  // Date-only values must not go through `Date` (UTC midnight would shift the JHB calendar day).
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const t = new Date(s);
  if (Number.isNaN(t.getTime())) return null;
  return johannesburgCalendarYmd(t);
}

function normalizeScheduleYmd(raw: string | null | undefined): string | null {
  const d = String(raw ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return d;
}

/** Bucket key for period filters: completion instant in JHB, else `schedule_date`, else null. */
export function earningsPeriodBucketYmd(row: EarningsPeriodBucketInput): string | null {
  const fromCompletion = johannesburgYmdFromCompletionField(row.completed_at);
  if (fromCompletion) return fromCompletion;
  return normalizeScheduleYmd(row.schedule_date ?? null);
}

/**
 * Sum `amount_cents` for completed earnings rows by Johannesburg calendar
 * (completion instant → local YMD vs today / ISO week / calendar month).
 *
 * **Midnight behaviour (not data loss):** `today_cents` only includes rows whose bucket `YYYY-MM-DD`
 * equals **today in Africa/Johannesburg**, so it resets to **0** at local midnight unless new
 * completions land that calendar day. `week_cents` uses Mon–Sun in JHB and resets on **Monday** local.
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
    const d = earningsPeriodBucketYmd(r);
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const c = Math.max(0, Math.round(Number(r.amount_cents) || 0));
    if (d === todayY) todayC += c;
    if (d >= weekStart && d <= todayY) weekC += c;
    if (d.slice(0, 7) === monthPrefix) monthC += c;
  }

  return { today_cents: todayC, week_cents: weekC, month_cents: monthC };
}
