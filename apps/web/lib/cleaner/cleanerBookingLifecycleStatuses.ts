/**
 * Bookings.status values that allow cleaner accept / reject / en_route / start in
 * {@link runCleanerBookingLifecycleAction}. Keep in sync with UI
 * {@link deriveCleanerJobUiState} / {@link isAssignedOperationalStatus}.
 *
 * Production rows may use `offered` while dispatch is still resolving; treat like assignable work.
 */
export const CLEANER_LIFECYCLE_ASSIGNABLE_STATUSES = ["offered", "assigned", "confirmed"] as const;

export function isAssignableForCleanerLifecycleStatus(status: string | null | undefined): boolean {
  const s = String(status ?? "")
    .trim()
    .toLowerCase();
  return (CLEANER_LIFECYCLE_ASSIGNABLE_STATUSES as readonly string[]).includes(s);
}
