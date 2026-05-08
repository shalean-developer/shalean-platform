/** UUID v1–v5 pattern used for booking payment deep links (client + server). */
export const BOOKING_PAYMENT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isBookingPaymentUuid(raw: string | null | undefined): boolean {
  const s = raw?.trim() ?? "";
  return s.length > 0 && BOOKING_PAYMENT_UUID_RE.test(s);
}
