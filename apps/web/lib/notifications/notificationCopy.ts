import { todayYmdJohannesburg } from "@/lib/booking/dateInJohannesburg";

/** Next calendar day after `fromYmd` in Africa/Johannesburg (handles month boundaries). */
function nextCalendarDayYmdJohannesburg(fromYmd: string): string {
  const base = Date.parse(`${fromYmd.trim()}T12:00:00+02:00`);
  if (!Number.isFinite(base)) return fromYmd;
  const next = base + 24 * 60 * 60 * 1000;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(next));
}

/** South Africa has no DST — fixed +02:00 for booking wall time → UTC instant. */
export function bookingStartUtcMs(dateYmd: string, timeHm: string): number | null {
  const d = dateYmd.trim();
  const t = timeHm.trim().slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{2}:\d{2}$/.test(t)) return null;
  const ms = Date.parse(`${d}T${t}:00+02:00`);
  return Number.isFinite(ms) ? ms : null;
}

/** e.g. "tomorrow at 10:00", "today at 14:00", "Mon, 28 Apr at 09:00" */
export function formatWhenForCustomerCopy(dateYmd: string | null | undefined, timeHm: string | null | undefined): string {
  const d = dateYmd?.trim() ?? "";
  const t = (timeHm?.trim() ?? "").slice(0, 5);
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{2}:\d{2}$/.test(t)) return "your scheduled time";
  const today = todayYmdJohannesburg();
  const tomorrow = nextCalendarDayYmdJohannesburg(today);
  if (d === today) return `today at ${t}`;
  if (d === tomorrow) return `tomorrow at ${t}`;
  const [y, m, day] = d.split("-").map(Number);
  const label = new Date(y, m - 1, day).toLocaleDateString("en-ZA", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  return `${label} at ${t}`;
}

export function serviceTitleForCopy(serviceLabel: string | null | undefined): string {
  const s = serviceLabel?.trim();
  return s && s.length > 0 ? s : "cleaning";
}
