/** Calendar month key `YYYY-MM` in Africa/Johannesburg (billing bucket). */
export function johannesburgMonthKey(d = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" }).slice(0, 7);
}

/**
 * First and last calendar day of that JHB month as `YYYY-MM-DD` (for `bookings.date` string range).
 * Prefer this for admin billing impact (`/api/admin/customers/.../billing`) and any monthly-invoice guards
 * so month boundaries stay aligned with `Africa/Johannesburg`.
 */
export function johannesburgCalendarMonthDateRangeYmd(now = new Date()): { ym: string; startYmd: string; endYmd: string } {
  const ym = johannesburgMonthKey(now);
  const [yStr, mStr] = ym.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(y, m, 0).getDate();
  return { ym, startYmd: `${ym}-01`, endYmd: `${ym}-${pad(lastDay)}` };
}
