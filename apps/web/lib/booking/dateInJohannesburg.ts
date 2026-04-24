/** `YYYY-MM-DD` for "today" in Africa/Johannesburg (booking dates are local to the business). */
export function todayYmdJohannesburg(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Start of the Johannesburg calendar day as UTC ISO (SAST is UTC+2 year-round). */
export function startOfTodayJohannesburgUtcIso(d = new Date()): string {
  const ymd = todayYmdJohannesburg(d);
  return new Date(`${ymd}T00:00:00+02:00`).toISOString();
}
