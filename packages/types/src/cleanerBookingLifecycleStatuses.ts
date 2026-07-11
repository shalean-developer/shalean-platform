import { canonicalDbBookingStatus } from "./canonicalBookingStatus";

/**
 * Bookings.status values that allow cleaner accept / reject / en_route / start in
 * {@link runCleanerBookingLifecycleAction}. Keep in sync with UI
 * {@link deriveCleanerJobUiState} (via `describeBookingOperationalState`).
 *
 * `offered` is still a raw DB status for dispatch; `confirmed` is normalized to `assigned`
 * via {@link canonicalDbBookingStatus}.
 */
export const CLEANER_LIFECYCLE_ASSIGNABLE_STATUSES = ["offered", "assigned"] as const;

export function isAssignableForCleanerLifecycleStatus(status: string | null | undefined): boolean {
  const s = canonicalDbBookingStatus(status);
  return s === "offered" || s === "assigned";
}
