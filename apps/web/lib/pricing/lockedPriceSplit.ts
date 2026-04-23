import type { LockedBooking } from "@/lib/booking/lockedBooking";

/**
 * Splits the locked checkout total into extras vs remainder for display only.
 * Prefers frozen `extras_line_items` from the lock API when present.
 */
export function splitLockedFinalPrice(locked: LockedBooking): {
  serviceTotal: number;
  extrasTotal: number;
} {
  const total = locked.finalPrice;
  if (Array.isArray(locked.extras_line_items) && locked.extras_line_items.length > 0) {
    const extrasRaw = locked.extras_line_items.reduce((s, x) => s + (Number(x.price) || 0), 0);
    const extrasTotal = Math.min(total, Math.round(extrasRaw));
    const serviceTotal = Math.max(0, total - extrasTotal);
    return { serviceTotal, extrasTotal };
  }
  return { serviceTotal: total, extrasTotal: 0 };
}
