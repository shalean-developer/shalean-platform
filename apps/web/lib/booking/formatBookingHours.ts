/** Compact hours label for mobile chrome (e.g. `6.3 hrs`). */
export function formatBookingHoursCompact(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "";
  const h = hours % 1 === 0 ? String(hours) : hours.toFixed(1).replace(/\.0$/, "");
  return `${h} hrs`;
}
