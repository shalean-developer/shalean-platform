/** Mon–Sun with JS getUTCDay() convention: 0 = Sunday … 6 = Saturday. */
export type WeeklyScheduleWindow = { day: number; start: string; end: string };

function padHm(h: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(h).trim());
  if (!m) return String(h).trim().slice(0, 5);
  const hh = Number(m[1]);
  const mm = m[2];
  if (!Number.isFinite(hh) || hh > 23) return String(h).trim().slice(0, 5);
  return `${String(hh).padStart(2, "0")}:${mm}`;
}

/** UTC weekday 0–6 for YYYY-MM-DD (noon anchor). */
export function utcWeekdayFromDateYmd(dateYmd: string): number {
  const p = dateYmd.split("-").map((x) => Number(x));
  if (p.length < 3 || !p.every((n) => Number.isFinite(n))) return 0;
  return new Date(Date.UTC(p[0]!, p[1]! - 1, p[2]!, 12, 0, 0)).getUTCDay();
}

export type GeneratedAvailabilityRow = {
  date: string;
  start_time: string;
  end_time: string;
  is_available: boolean;
};

/**
 * Expands weekly windows into concrete `cleaner_availability`-style rows
 * for [startYmd, startYmd + horizonDays) (inclusive start, exclusive end offset by horizon).
 */
export function expandWeeklyScheduleToRows(
  weeklySchedule: WeeklyScheduleWindow[],
  startYmd: string,
  horizonDays: number,
): GeneratedAvailabilityRow[] {
  const byDay = new Map<number, WeeklyScheduleWindow[]>();
  for (const w of weeklySchedule) {
    const day = Number(w.day);
    if (!Number.isInteger(day) || day < 0 || day > 6) continue;
    const start = padHm(w.start);
    const end = padHm(w.end);
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) continue;
    const arr = byDay.get(day) ?? [];
    arr.push({ day, start, end });
    byDay.set(day, arr);
  }

  const out: GeneratedAvailabilityRow[] = [];
  const start = new Date(`${startYmd}T12:00:00.000Z`);
  if (!Number.isFinite(start.getTime())) return out;

  for (let i = 0; i < horizonDays; i += 1) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
    const da = String(d.getUTCDate()).padStart(2, "0");
    const dateStr = `${y}-${mo}-${da}`;
    const wd = d.getUTCDay();
    const wins = byDay.get(wd);
    if (!wins?.length) continue;
    for (const w of wins) {
      out.push({
        date: dateStr,
        start_time: w.start,
        end_time: w.end,
        is_available: true,
      });
    }
  }
  return out;
}
