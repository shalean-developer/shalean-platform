/**
 * Booking rows in these statuses are ignored for active-slot duplicate checks.
 * Keep in sync with partial indexes `idx_bookings_active_dup`, `idx_bookings_unique_active_customer_slot`,
 * SQL `public.booking_matches_active_admin_slot`, and `applyActiveAdminBookingSlotFilters` in
 * `lib/booking/activeAdminBookingSlot.ts`.
 */
export const TERMINAL_BOOKING_STATUSES_FOR_DUPLICATE_GUARD = ["cancelled", "failed", "payment_expired"] as const;

export type TerminalBookingStatusForDuplicateGuard =
  (typeof TERMINAL_BOOKING_STATUSES_FOR_DUPLICATE_GUARD)[number];

/** PostgREST `.not("status", "in", ...)` filter value, e.g. `(cancelled,failed,payment_expired)`. */
export function terminalStatusesNotInDuplicateProbe(): string {
  return `(${TERMINAL_BOOKING_STATUSES_FOR_DUPLICATE_GUARD.join(",")})`;
}
