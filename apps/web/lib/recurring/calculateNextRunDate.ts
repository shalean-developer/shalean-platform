import { addDaysYmd, compareYmd, isoWeekdayFromYmd, parseYmdSast, todayJohannesburg } from "@/lib/recurring/johannesburgCalendar";

export type RecurringFrequency = "weekly" | "biweekly" | "monthly";

export type MonthlyPattern = "mirror_start_date" | "nth_weekday" | "last_weekday";

export type RecurringScheduleRow = {
  frequency: RecurringFrequency;
  days_of_week: number[];
  start_date: string;
  end_date: string | null;
  /** Monthly only; defaults to mirror_start_date when omitted. */
  monthly_pattern?: MonthlyPattern | null;
  /** When `monthly_pattern` is `nth_weekday`: 1 = first … 4 = fourth (primary weekday). */
  monthly_nth?: number | null;
};

function sortDays(days: number[]): number[] {
  return [...new Set(days)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
}

function mondayWeekStartMs(ymd: string): number {
  const d = parseYmdSast(ymd);
  const iso = isoWeekdayFromYmd(ymd);
  const mondayOffset = iso - 1;
  return d.getTime() - mondayOffset * 86400000;
}

function weekParityIndex(ymd: string, anchorYmd: string): number {
  const w0 = mondayWeekStartMs(anchorYmd);
  const w1 = mondayWeekStartMs(ymd);
  const weeks = Math.round((w1 - w0) / (7 * 86400000));
  return ((weeks % 2) + 2) % 2;
}

function weekOrdinalInMonth(ymd: string): number {
  const dom = Number(ymd.slice(8, 10));
  const iso = isoWeekdayFromYmd(ymd);
  const firstOfMonth = `${ymd.slice(0, 8)}01`;
  const firstIso = isoWeekdayFromYmd(firstOfMonth);
  const delta = (iso - firstIso + 7) % 7;
  const firstOccDom = 1 + delta;
  if (dom < firstOccDom) return 0;
  return Math.floor((dom - firstOccDom) / 7) + 1;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Calendar month length; `month1` is 1–12 (January = 1). */
function daysInCalendarMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate();
}

/** Primary weekday for monthly rules: smallest ISO weekday in `days_of_week`. */
function primaryIsoWeekday(row: RecurringScheduleRow): number {
  const d = sortDays(row.days_of_week);
  return d[0] ?? 1;
}

/** Nth (1–4) occurrence of `isoWd` in the calendar month of `year`/`month1`. */
function nthWeekdayInCalendarMonth(year: number, month1: number, isoWd: number, n: number): string | null {
  const dim = daysInCalendarMonth(year, month1);
  let seen = 0;
  for (let dom = 1; dom <= dim; dom++) {
    const ymd = `${year}-${pad2(month1)}-${pad2(dom)}`;
    if (isoWeekdayFromYmd(ymd) === isoWd) {
      seen++;
      if (seen === n) return ymd;
    }
  }
  return null;
}

/** Last occurrence of `isoWd` in the calendar month. */
function lastWeekdayInCalendarMonth(year: number, month1: number, isoWd: number): string | null {
  const dim = daysInCalendarMonth(year, month1);
  for (let dom = dim; dom >= 1; dom--) {
    const ymd = `${year}-${pad2(month1)}-${pad2(dom)}`;
    if (isoWeekdayFromYmd(ymd) === isoWd) return ymd;
  }
  return null;
}

function matchesFrequency(row: RecurringScheduleRow, ymd: string): boolean {
  const days = sortDays(row.days_of_week);
  if (!days.includes(isoWeekdayFromYmd(ymd))) return false;
  if (compareYmd(ymd, row.start_date) < 0) return false;
  if (row.end_date && compareYmd(ymd, row.end_date) > 0) return false;

  if (row.frequency === "weekly") return true;
  if (row.frequency === "biweekly") {
    return weekParityIndex(ymd, row.start_date) === weekParityIndex(row.start_date, row.start_date);
  }
  if (row.frequency === "monthly") {
    const pattern = row.monthly_pattern ?? "mirror_start_date";
    const y = Number(ymd.slice(0, 4));
    const m = Number(ymd.slice(5, 7));
    const primaryWd = primaryIsoWeekday(row);

    if (pattern === "nth_weekday" && row.monthly_nth != null && row.monthly_nth >= 1 && row.monthly_nth <= 4) {
      const target = nthWeekdayInCalendarMonth(y, m, primaryWd, row.monthly_nth);
      if (!target || target !== ymd) return false;
      if (compareYmd(ymd, row.start_date) < 0) return false;
      if (row.end_date && compareYmd(ymd, row.end_date) > 0) return false;
      return days.includes(isoWeekdayFromYmd(ymd));
    }

    if (pattern === "last_weekday") {
      const target = lastWeekdayInCalendarMonth(y, m, primaryWd);
      if (!target || target !== ymd) return false;
      if (compareYmd(ymd, row.start_date) < 0) return false;
      if (row.end_date && compareYmd(ymd, row.end_date) > 0) return false;
      return days.includes(isoWeekdayFromYmd(ymd));
    }

    const anchorOrd = weekOrdinalInMonth(row.start_date);
    if (ymd.slice(0, 7) === row.start_date.slice(0, 7) && compareYmd(ymd, row.start_date) < 0) return false;
    return (
      weekOrdinalInMonth(ymd) === anchorOrd && isoWeekdayFromYmd(ymd) === isoWeekdayFromYmd(row.start_date)
    );
  }
  return false;
}

/**
 * Smallest `YYYY-MM-DD` strictly after `fromExclusiveYmd` that satisfies the recurring schedule,
 * capped by `end_date` when set. Falls back to `fromExclusiveYmd` + 1 day if none found in search window.
 */
export function calculateNextRunDate(
  row: RecurringScheduleRow,
  fromExclusiveYmd: string = todayJohannesburg(),
): string {
  const days = sortDays(row.days_of_week);
  if (days.length === 0) return addDaysYmd(fromExclusiveYmd, 1);

  let cursor = addDaysYmd(fromExclusiveYmd, 1);
  const hardStop = addDaysYmd(fromExclusiveYmd, 800);
  while (compareYmd(cursor, hardStop) <= 0) {
    if (row.end_date && compareYmd(cursor, row.end_date) > 0) break;
    if (matchesFrequency(row, cursor)) return cursor;
    cursor = addDaysYmd(cursor, 1);
  }
  return addDaysYmd(fromExclusiveYmd, 1);
}

/**
 * All service dates in `[fromYmd, throughYmd]` inclusive that match the schedule.
 */
export function occurrenceDatesInclusive(row: RecurringScheduleRow, fromYmd: string, throughYmd: string): string[] {
  const out: string[] = [];
  let cursor = fromYmd;
  while (compareYmd(cursor, throughYmd) <= 0) {
    if (matchesFrequency(row, cursor)) out.push(cursor);
    cursor = addDaysYmd(cursor, 1);
  }
  return out;
}

/** First schedule date in `[minYmd, minYmd+730d]` inclusive, or `minYmd` if none (invalid config). */
export function firstOccurrenceOnOrAfter(row: RecurringScheduleRow, minYmd: string): string {
  const through = addDaysYmd(minYmd, 730);
  const hits = occurrenceDatesInclusive(row, minYmd, through);
  return hits[0] ?? minYmd;
}
