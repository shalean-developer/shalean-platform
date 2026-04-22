/** `YYYY-MM-DD` for "today" in Africa/Johannesburg (booking dates are local to the business). */
export function todayYmdJohannesburg(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
