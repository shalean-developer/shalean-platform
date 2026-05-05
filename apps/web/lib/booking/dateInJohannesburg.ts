/** `YYYY-MM-DD` for "today" in Africa/Johannesburg (booking dates are local to the business). */
export function todayYmdJohannesburg(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Format a UTC ISO timestamp as `YYYY-MM-DD` on the Africa/Johannesburg calendar (avoids UTC `slice(0,10)` drift). */
export function formatIsoInJohannesburgYmd(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso.length >= 10 ? iso.slice(0, 10) : iso;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(t));
}

/** Start of the Johannesburg calendar day as UTC ISO (SAST is UTC+2 year-round). */
export function startOfTodayJohannesburgUtcIso(d = new Date()): string {
  const ymd = todayYmdJohannesburg(d);
  return new Date(`${ymd}T00:00:00+02:00`).toISOString();
}
