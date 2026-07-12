/**
 * Booking fulfillment modes for Phase A soft checkout.
 * Distinct from lifecycle `bookings.status` and from selected-cleaner `pending_assignment`.
 */

export const BOOKING_FULFILLMENT_MODES = ["instant", "ops_assignment", "area_review"] as const;

export type BookingFulfillmentMode = (typeof BOOKING_FULFILLMENT_MODES)[number];

export function isBookingFulfillmentMode(value: unknown): value is BookingFulfillmentMode {
  return (
    typeof value === "string" &&
    (BOOKING_FULFILLMENT_MODES as readonly string[]).includes(value.trim().toLowerCase())
  );
}

export function normalizeBookingFulfillmentMode(
  value: unknown,
  fallback: BookingFulfillmentMode = "instant",
): BookingFulfillmentMode {
  if (typeof value !== "string") return fallback;
  const s = value.trim().toLowerCase();
  return isBookingFulfillmentMode(s) ? s : fallback;
}

/** Customer-facing status badge for soft-fulfillment paths. */
export function customerFulfillmentBadgeLabel(mode: BookingFulfillmentMode | null | undefined): string | null {
  switch (normalizeBookingFulfillmentMode(mode, "instant")) {
    case "ops_assignment":
      return "Pending Assignment";
    case "area_review":
      return "Area Review";
    default:
      return null;
  }
}

export const SOFT_FULFILLMENT_CUSTOMER_COPY = {
  opsAssignment:
    "Your requested time isn't immediately available, but we'll assign the best available cleaner and confirm shortly.",
  areaReview:
    "We're expanding into your area. Reserve your booking and our scheduling team will contact you to confirm availability.",
  noInstantSlotsDay:
    "We don't currently have a cleaner assigned for this time. Reserve your booking and our scheduling team will confirm it shortly.",
} as const;
