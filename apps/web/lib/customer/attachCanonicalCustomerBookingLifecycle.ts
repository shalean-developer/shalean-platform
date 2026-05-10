import type { BookingRow } from "@/lib/dashboard/types";
import { toCanonicalBookingLifecycleSurface } from "@/lib/booking/readModels/bookingReadModel";

/**
 * Adds `canonicalLifecycle` via `toCanonicalBookingLifecycleSurface` (customer viewer).
 * Does not remove or rename any existing row fields.
 */
export function attachCanonicalCustomerBookingLifecycle(row: BookingRow): BookingRow {
  return {
    ...row,
    canonicalLifecycle: toCanonicalBookingLifecycleSurface(row as Record<string, unknown>, "customer"),
  };
}
