/** Shift the entire synthetic booking timeline by whole weeks when its oldest
 * (-42 day) scenario would cross the processing floor. Preserve relative slots. */
export function forwardSeedBookingDate(daysFromNow, now = new Date()) {
  const day = new Date(`${now.toISOString().slice(0, 10)}T12:00:00Z`);
  const floor = new Date('2026-10-01T12:00:00Z');
  const oldest = new Date(day.getTime() - 42 * 86400000);
  const shiftWeeks = Math.max(0, Math.ceil((floor.getTime() - oldest.getTime()) / (7 * 86400000)));
  return new Date(day.getTime() + (daysFromNow + shiftWeeks * 7) * 86400000).toISOString().slice(0, 10);
}
