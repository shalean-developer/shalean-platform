import { BOOKING_CHECKOUT_LOCK_VERSION, validateLockForCheckout } from "@/lib/booking/checkoutLockValidation";
import { normalizeVipTier } from "@/lib/pricing/vipTier";
import type { LockedBooking } from "@/lib/booking/lockedBooking";
import type { PricingRatesSnapshot } from "@/lib/pricing/pricingRatesSnapshot";
import {
  quoteCheckoutZarWithSnapshot,
  computeJobSubtotalZarSnapshot,
} from "@/lib/pricing/pricingEngineSnapshot";

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

function lockMatchesPricingEngine(locked: LockedBooking, ratesSnapshot: PricingRatesSnapshot): boolean {
  const tier = normalizeVipTier(locked.vipTier);
  const dyn =
    typeof locked.dynamicSurgeFactor === "number" &&
    locked.dynamicSurgeFactor >= 0.8 &&
    locked.dynamicSurgeFactor <= 1.2
      ? locked.dynamicSurgeFactor
      : 1;
  const q = quoteCheckoutZarWithSnapshot(
    ratesSnapshot,
    {
      service: locked.service,
      serviceType: locked.service_type,
      rooms: locked.rooms,
      bathrooms: locked.bathrooms,
      extraRooms: locked.extraRooms,
      extras: locked.extras,
    },
    locked.time,
    tier,
    {
      dynamicAdjustment: dyn,
      cleanersCount: locked.cleanersCount,
    },
  );
  const priceOk = Math.abs(q.totalZar - locked.finalPrice) <= 1;
  const hoursOk = Math.abs(q.hours - locked.finalHours) <= 0.1;
  return priceOk && hoursOk;
}

/**
 * Ensures `locked.finalPrice` matches the pricing engine for the given catalog snapshot.
 */
export function isLockedBookingPriceValid(locked: LockedBooking, ratesSnapshot: PricingRatesSnapshot): boolean {
  if (!Number.isFinite(locked.finalPrice) || locked.finalPrice < 1) return false;
  if (!Number.isFinite(locked.finalHours) || locked.finalHours <= 0) return false;

  if (locked.pricingVersion === BOOKING_CHECKOUT_LOCK_VERSION) {
    if (typeof locked.time !== "string" || !locked.time.trim()) return false;
    const hasSig =
      typeof locked.quoteSignature === "string" && /^[0-9a-f]{64}$/i.test(locked.quoteSignature.trim());
    if (hasSig) {
      return validateLockForCheckout(locked, Date.now(), { skipExpiryCheck: true, ratesSnapshot }).ok;
    }
    return lockMatchesPricingEngine(locked, ratesSnapshot);
  }

  const input = {
    service: locked.service,
    serviceType: locked.service_type,
    rooms: locked.rooms,
    bathrooms: locked.bathrooms,
    extraRooms: locked.extraRooms,
    extras: locked.extras,
  };

  const baseTotal = computeJobSubtotalZarSnapshot(ratesSnapshot, input);

  if (locked.vipTier != null && typeof locked.time === "string" && locked.time.trim()) {
    const tier = normalizeVipTier(locked.vipTier);
    const dyn =
      typeof locked.dynamicSurgeFactor === "number" &&
      locked.dynamicSurgeFactor >= 0.8 &&
      locked.dynamicSurgeFactor <= 1.2
        ? locked.dynamicSurgeFactor
        : 1;
    const q = quoteCheckoutZarWithSnapshot(ratesSnapshot, input, locked.time, tier, {
      dynamicAdjustment: dyn,
      cleanersCount: locked.cleanersCount,
    });
    const priceOk = Math.abs(q.totalZar - locked.finalPrice) <= 1;
    const hoursOk = Math.abs(q.hours - locked.finalHours) <= 0.1;
    return priceOk && hoursOk;
  }

  const legacy = Math.round(baseTotal * legacySurge(locked.time));
  return Math.abs(legacy - locked.finalPrice) <= 1;
}
