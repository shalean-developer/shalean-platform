import type { BookingRow } from "@/lib/dashboard/types";
import { toCanonicalBookingLifecycleSurface } from "@/lib/booking/readModels/bookingReadModel";

/**
 * Adds `canonicalLifecycle` via `toCanonicalBookingLifecycleSurface` (customer viewer),
 * including `dashboardAlignment` — same shape as cleaner/admin `dashboardLifecycle` on those APIs.
 */
export function attachCanonicalCustomerBookingLifecycle(row: BookingRow): BookingRow {
  return {
    ...row,
    canonicalLifecycle: toCanonicalBookingLifecycleSurface(row as Record<string, unknown>, "customer"),
  };
}
