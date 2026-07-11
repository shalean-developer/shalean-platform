import { johannesburgCalendarYmd, johannesburgCalendarYmdAddDays } from "@shalean/utils";

const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export type ScheduleDay = {
  ymd: string;
  weekday: string;
  dayNum: number;
  isToday: boolean;
};

/** Rolling window starting at Johannesburg today. */
export function buildScheduleDays(count = 7, now = new Date()): ScheduleDay[] {
  const today = johannesburgCalendarYmd(now);
  return Array.from({ length: count }, (_, i) => {
    const ymd = johannesburgCalendarYmdAddDays(today, i);
    const [y, m, d] = ymd.split("-").map(Number);
    const utc = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1, 12));
    return {
      ymd,
      weekday: WEEKDAYS_SHORT[utc.getUTCDay()] ?? "—",
      dayNum: d ?? 1,
      isToday: ymd === today,
    };
  });
}

export function dayAvailabilityLabel(
  availability: Array<{ date: string; is_available?: boolean | null; start_time?: string | null; end_time?: string | null }>,
  ymd: string,
): string | null {
  const rows = availability.filter((r) => String(r.date).trim() === ymd);
  if (rows.length === 0) return null;
  const anyOpen = rows.some((r) => r.is_available !== false);
  if (!anyOpen) return "Unavailable";
  const withHours = rows.find((r) => r.start_time || r.end_time);
  if (withHours?.start_time && withHours?.end_time) {
    return `${String(withHours.start_time).slice(0, 5)}–${String(withHours.end_time).slice(0, 5)}`;
  }
  return "Available";
}
