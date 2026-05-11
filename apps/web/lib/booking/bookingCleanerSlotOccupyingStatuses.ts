/**
 * Bookings that still occupy a cleaner for calendar conflict checks (customer eligibility, admin, dispatch).
 * Aligned with {@link getEligibleCleaners} occupancy and {@link findCleanerSlotOccupancyConflict}.
 * Keep in sync with any DB partial indexes that reference booking `status`.
 */
export const BOOKING_SLOT_OCCUPYING_STATUSES = [
  "pending",
  "pending_payment",
  "pending_assignment",
  "assigned",
  "in_progress",
  "confirmed",
] as const;

/** @deprecated Prefer {@link BOOKING_SLOT_OCCUPYING_STATUSES} */
export const BOOKING_CLEANER_SLOT_OCCUPYING_STATUSES = BOOKING_SLOT_OCCUPYING_STATUSES;

export type BookingSlotOccupyingStatus = (typeof BOOKING_SLOT_OCCUPYING_STATUSES)[number];
export type BookingCleanerSlotOccupyingStatus = BookingSlotOccupyingStatus;
