/**
 * Bookings that still occupy a cleaner for calendar conflict checks (admin overlap, future availability).
 * Keep in sync with any DB partial indexes that reference booking `status`.
 */
export const BOOKING_CLEANER_SLOT_OCCUPYING_STATUSES = [
  "pending",
  "pending_payment",
  "assigned",
  "in_progress",
  "pending_assignment",
] as const;

export type BookingCleanerSlotOccupyingStatus = (typeof BOOKING_CLEANER_SLOT_OCCUPYING_STATUSES)[number];
