export type BookingPricingAvailability = "loading" | "available" | "unavailable";

export const BOOKING_PRICING_UNAVAILABLE_MESSAGE =
  "Live pricing is temporarily unavailable. Please refresh and try again before payment.";

export function canEnterBookingPayment(
  availability: BookingPricingAvailability,
): boolean {
  return availability === "available";
}
