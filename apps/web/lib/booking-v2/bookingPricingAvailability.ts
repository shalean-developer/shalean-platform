export type BookingPricingAvailability = "loading" | "available" | "unavailable";

export const BOOKING_PRICING_LOADING_MESSAGE =
  "Loading live pricing. Payment will be available once pricing is ready.";

export const BOOKING_PRICING_UNAVAILABLE_MESSAGE =
  "Live pricing is temporarily unavailable. Please refresh and try again before payment.";

/**
 * New bookings may enter payment only after the catalog is available. A booking
 * that was already persisted may always reopen its server-owned payment session,
 * even while the client catalog is loading or temporarily unavailable.
 */
export function canEnterBookingPayment(
  availability: BookingPricingAvailability,
  hasPendingBooking = false,
): boolean {
  return hasPendingBooking || availability === "available";
}
