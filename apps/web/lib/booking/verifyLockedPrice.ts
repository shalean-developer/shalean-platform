import { calculatePrice as calculateBaseJobPrice, calculateSmartQuote } from "@/lib/pricing/calculatePrice";
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

/**
 * True when the lock looks like a modern checkout snapshot from Step 4 (`/api/booking/price`).
 * We trust the persisted total — recomputing here caused drift vs the pricing API and blocked Paystack.
 */
function isTrustedModernLock(locked: LockedBooking): boolean {
  return (
    locked.pricingVersion === 2 ||
    (typeof locked.cleanersCount === "number" && Number.isFinite(locked.cleanersCount) && locked.cleanersCount >= 0)
  );
}

/** Ensures `locked.finalPrice` is sane; modern locks are trusted as the single source of truth. */
export function isLockedBookingPriceValid(locked: LockedBooking): boolean {
  if (!Number.isFinite(locked.finalPrice) || locked.finalPrice < 1) return false;
  if (!Number.isFinite(locked.finalHours) || locked.finalHours <= 0) return false;

  if (isTrustedModernLock(locked)) {
    return true;
  }

  const input = {
    service: locked.service,
    serviceType: locked.service_type,
    rooms: locked.rooms,
    bathrooms: locked.bathrooms,
    extraRooms: locked.extraRooms,
    extras: locked.extras,
  };

  const { total: baseTotal } = calculateBaseJobPrice(input);

  if (locked.vipTier != null) {
    const tier = normalizeVipTier(locked.vipTier);
    const dyn =
      typeof locked.dynamicSurgeFactor === "number" &&
      locked.dynamicSurgeFactor >= 0.8 &&
      locked.dynamicSurgeFactor <= 1.2
        ? locked.dynamicSurgeFactor
        : 1;
    const q = calculateSmartQuote(input, locked.time, tier, { dynamicAdjustment: dyn });
    return Math.abs(q.total - locked.finalPrice) <= 1;
  }

  const legacy = Math.round(baseTotal * legacySurge(locked.time));
  return Math.abs(legacy - locked.finalPrice) <= 1;
}
