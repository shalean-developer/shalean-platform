/**
 * DB `bookings.status` values a customer may cancel or reschedule online.
 * Must stay aligned with {@link CUSTOMER_MODIFY_PHASES} in `dashboardBookingOperational.ts`
 * (operational phase `pending` covers `pending_assignment` and `offered`).
 */
export const CUSTOMER_CANCELLABLE_BOOKING_STATUSES = new Set([
  "pending",
  "confirmed",
  "assigned",
  "pending_assignment",
  "offered",
]);

export const CUSTOMER_RESCHEDULABLE_BOOKING_STATUSES = CUSTOMER_CANCELLABLE_BOOKING_STATUSES;

export function normalizeBookingStatusForCustomerModify(raw: string | null | undefined): string {
  return String(raw ?? "").trim().toLowerCase();
}

export function isCustomerCancellableBookingStatus(status: string | null | undefined): boolean {
  return CUSTOMER_CANCELLABLE_BOOKING_STATUSES.has(normalizeBookingStatusForCustomerModify(status));
}

export function isCustomerReschedulableBookingStatus(status: string | null | undefined): boolean {
  return CUSTOMER_RESCHEDULABLE_BOOKING_STATUSES.has(normalizeBookingStatusForCustomerModify(status));
}

/** Re-run auto-dispatch after reschedule when still unassigned. */
export const CUSTOMER_RESCHEDULE_REDISPATCH_STATUSES = new Set([
  "pending",
  "pending_assignment",
  "offered",
]);
