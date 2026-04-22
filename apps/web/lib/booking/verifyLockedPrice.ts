import { calculatePrice, calculateSmartQuote } from "@/lib/pricing/calculatePrice";
import { normalizeVipTier } from "@/lib/pricing/vipTier";
import type { LockedBooking } from "@/lib/booking/lockedBooking";

/** Pre–demand-pricing per-slot map — only for validating legacy `booking_locked` payloads. */
const LEGACY_SLOT_SURGE_MAP: Record<string, number> = {
  "08:00": 1.2,
  "09:00": 1.1,
  "10:00": 1.0,
  "13:00": 1.05,
  "14:00": 1.1,
};

function legacySurge(time: string): number {
  const m = LEGACY_SLOT_SURGE_MAP[time];
  return typeof m === "number" && Number.isFinite(m) ? m : 1;
}

/** Ensures `locked.finalPrice` matches server-side pricing rules (VIP + demand or legacy surge). */
export function isLockedBookingPriceValid(locked: LockedBooking): boolean {
  const input = {
    service: locked.service,
    serviceType: locked.service_type,
    rooms: locked.rooms,
    bathrooms: locked.bathrooms,
    extraRooms: locked.extraRooms,
    extras: locked.extras,
  };

  const { total: baseTotal } = calculatePrice(input);

  if (locked.pricingVersion === 2 || locked.vipTier != null) {
    const tier = normalizeVipTier(locked.vipTier);
    const dyn =
      typeof locked.dynamicSurgeFactor === "number" &&
      locked.dynamicSurgeFactor >= 0.8 &&
      locked.dynamicSurgeFactor <= 1.2
        ? locked.dynamicSurgeFactor
        : 1;
    const q = calculateSmartQuote(input, locked.time, tier, { dynamicAdjustment: dyn });
    return q.total === locked.finalPrice;
  }

  const legacy = Math.round(baseTotal * legacySurge(locked.time));
  return legacy === locked.finalPrice;
}
