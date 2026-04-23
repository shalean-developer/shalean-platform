/**
 * Previous calendar week (Mon–Sun) in UTC date parts — used for payout batch labels.
 * Completion date (`completed_at` date or `date`) must fall in [start, end] inclusive.
 */
export function getPreviousWeekDateBoundsUtc(now: Date = new Date()): { periodStart: string; periodEnd: string } {
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = utc.getUTCDay();
  const daysSinceMonday = (dow + 6) % 7;
  const thisMonday = new Date(utc);
  thisMonday.setUTCDate(thisMonday.getUTCDate() - daysSinceMonday);
  const lastMonday = new Date(thisMonday);
  lastMonday.setUTCDate(lastMonday.getUTCDate() - 7);
  const lastSunday = new Date(lastMonday);
  lastSunday.setUTCDate(lastSunday.getUTCDate() + 6);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  return { periodStart: ymd(lastMonday), periodEnd: ymd(lastSunday) };
}

export function completionDayYmd(booking: { completed_at?: string | null; date?: string | null }): string | null {
  if (typeof booking.completed_at === "string" && booking.completed_at.length >= 10) {
    return booking.completed_at.slice(0, 10);
  }
  if (typeof booking.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(booking.date)) {
    return booking.date;
  }
  return null;
}

export function isYmdInInclusiveRange(ymd: string, start: string, end: string): boolean {
  return ymd >= start && ymd <= end;
}
