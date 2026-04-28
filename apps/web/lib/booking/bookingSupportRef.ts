/** Short customer/support-facing label for a booking (not globally unique; correlate with full id in logs). */
export function bookingSupportRefLabel(bookingId: string): string {
  const hex = String(bookingId ?? "")
    .replace(/-/g, "")
    .toUpperCase();
  const tail = hex.slice(-8);
  if (!tail) return "BK-????";
  return `BK-${tail}`;
}
