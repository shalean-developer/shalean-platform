import { todayYmdJohannesburg } from "@/lib/booking/dateInJohannesburg";

const BOOKING_CALENDAR_TZ = "Africa/Johannesburg";

function calendarDaysDiffUtc(fromYmd: string, toYmd: string): number {
  const utc = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(toYmd) - utc(fromYmd)) / 86_400_000);
}

function formatBookingDateInJohannesburg(ymd: string, fmt: Intl.DateTimeFormatOptions): string {
  const anchor = new Date(`${ymd}T12:00:00+02:00`);
  return new Intl.DateTimeFormat("en-ZA", { ...fmt, timeZone: BOOKING_CALENDAR_TZ }).format(anchor);
}

/** Human-friendly schedule line after confirm — uses business calendar (Johannesburg), same as booking dates. */
export function formatCleanerAvailabilityConfirmedMessage(
  date: string | null | undefined,
  time: string | null | undefined,
  now = new Date(),
): string {
  const ymd = String(date ?? "").trim().slice(0, 10);
  const timeRaw = String(time ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    return "✅ You're scheduled for this job.";
  }

  const todayJhb = todayYmdJohannesburg(now);
  const diffDays = calendarDaysDiffUtc(todayJhb, ymd);

  let dayPart: string;
  if (diffDays === 0) dayPart = "today";
  else if (diffDays === 1) dayPart = "tomorrow";
  else if (diffDays === -1) dayPart = "yesterday";
  else if (diffDays > 1 && diffDays <= 6) {
    dayPart = formatBookingDateInJohannesburg(ymd, { weekday: "long" });
  } else {
    dayPart = formatBookingDateInJohannesburg(ymd, { weekday: "short", month: "short", day: "numeric" });
  }

  const timePart = simplifyTimeLabel(timeRaw);
  if (timePart) return `✅ You're scheduled for ${dayPart} at ${timePart}.`;
  return `✅ You're scheduled for ${dayPart}.`;
}

function simplifyTimeLabel(raw: string): string {
  if (!raw) return "";
  const t = raw.replace(/\s+/g, " ").trim();
  if (/^\d{1,2}:\d{2}/.test(t)) {
    const match = /^(\d{1,2}):(\d{2})/.exec(t);
    if (match) {
      const hh = String(Number(match[1])).padStart(2, "0");
      return `${hh}:${match[2]}`;
    }
  }
  return t.length > 24 ? `${t.slice(0, 21)}…` : t;
}
