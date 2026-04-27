import { todayYmdJohannesburg } from "@/lib/booking/dateInJohannesburg";

/** Parse `YYYY-MM-DD` as a noon wall-time instant in SAST (UTC+2, no DST). */
export function parseYmdSast(ymd: string): Date {
  return new Date(`${ymd}T12:00:00+02:00`);
}

/** ISO weekday 1 = Monday … 7 = Sunday (Africa/Johannesburg calendar day). */
export function isoWeekdayFromYmd(ymd: string): number {
  const d = parseYmdSast(ymd);
  const n = d.getUTCDay();
  return n === 0 ? 7 : n;
}

export function addDaysYmd(ymd: string, days: number): string {
  const t = parseYmdSast(ymd).getTime() + days * 86400000;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(t));
}

export function compareYmd(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function todayJohannesburg(): string {
  return todayYmdJohannesburg();
}
