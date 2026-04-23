import type { LockedBooking } from "@/lib/booking/lockedBooking";
import { sumExtrasSubtotal } from "@/lib/pricing/calculatePrice";

/**
 * Splits the locked checkout total into extras vs remainder for display only.
 * Does not re-run pricing engines — proportions follow extras list vs total.
 */
export function splitLockedFinalPrice(locked: LockedBooking): {
  serviceTotal: number;
  extrasTotal: number;
} {
  const total = locked.finalPrice;
  const extrasRaw = sumExtrasSubtotal(locked.extras, locked.service);
  const extrasTotal = Math.min(total, Math.round(extrasRaw));
  const serviceTotal = total - extrasTotal;
  return { serviceTotal, extrasTotal };
}
