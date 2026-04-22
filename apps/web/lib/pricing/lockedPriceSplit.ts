import type { LockedBooking } from "@/lib/booking/lockedBooking";
import { calculatePrice, sumExtrasSubtotal } from "@/lib/pricing/calculatePrice";

/**
 * Splits `locked.finalPrice` into service vs extras for display only.
 * Uses the same shape as `calculatePrice` so proportions match the lock-time quote; the two parts always sum to `finalPrice`.
 */
export function splitLockedFinalPrice(locked: LockedBooking): {
  serviceTotal: number;
  extrasTotal: number;
} {
  const quote = calculatePrice({
    service: locked.service,
    serviceType: locked.service_type,
    rooms: locked.rooms,
    bathrooms: locked.bathrooms,
    extraRooms: locked.extraRooms,
    extras: locked.extras,
  });
  const extrasRaw = sumExtrasSubtotal(locked.extras);
  const serviceRaw = quote.total - extrasRaw;

  if (quote.total <= 0) {
    return { serviceTotal: locked.finalPrice, extrasTotal: 0 };
  }

  const serviceTotal = Math.round((serviceRaw / quote.total) * locked.finalPrice);
  const extrasTotal = locked.finalPrice - serviceTotal;
  return { serviceTotal, extrasTotal };
}
