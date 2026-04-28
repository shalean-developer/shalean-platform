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

/** True when `ymd` (YYYY-MM-DD, Africa/Johannesburg) is the last calendar day of its month. */
export function isLastDayOfMonthJohannesburg(ymd: string): boolean {
  const next = addDaysYmd(ymd, 1);
  return next.slice(0, 7) !== ymd.slice(0, 7);
}

/** Last calendar day of month `ym` (`YYYY-MM`) as `YYYY-MM-DD` (UTC calendar math; stable for comparisons). */
export function lastDayYmdOfInvoiceMonth(ym: string): string {
  const parts = ym.trim().split("-");
  if (parts.length < 2) return ym;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return ym;
  const d = new Date(Date.UTC(y, m, 0));
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** True when `todayYmd` is on or after the last day of calendar month `invoiceMonthYm` (`YYYY-MM`). */
export function isInvoiceMonthReadyToFinalize(todayYmd: string, invoiceMonthYm: string): boolean {
  const last = lastDayYmdOfInvoiceMonth(invoiceMonthYm);
  return compareYmd(todayYmd, last) >= 0;
}
