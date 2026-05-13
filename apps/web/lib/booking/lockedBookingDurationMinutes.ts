import type { LockedBooking } from "@/lib/booking/lockedBooking";
import { selectLegacyLockedBookingDurationMinutes } from "@/lib/pricing/legacyDurationSelection";

export function checkoutDurationMinutesFromLocked(locked: LockedBooking | null): number {
  return selectLegacyLockedBookingDurationMinutes(locked);
}
