/** Minutes from midnight for HH:MM (24h). */
export function hmToMinutes(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** True if booking time falls in [start, end] inclusive. */
export function isBookingTimeInWindow(bookingHm: string, startHm: string, endHm: string): boolean {
  const t = hmToMinutes(bookingHm);
  const a = hmToMinutes(startHm);
  const b = hmToMinutes(endHm);
  if (t == null || a == null || b == null) return false;
  return t >= a && t <= b;
}
