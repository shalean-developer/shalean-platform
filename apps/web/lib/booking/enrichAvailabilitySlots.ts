import type { VipTier } from "@/lib/pricing/vipTier";
import { quoteCheckoutZarWithSnapshot } from "@/lib/pricing/pricingEngineSnapshot";
import type { PricingJobInput } from "@/lib/pricing/pricingEngine";
import type { PricingRatesSnapshot } from "@/lib/pricing/pricingRatesSnapshot";

/** Rows from `/api/booking/time-slots` — no ZAR. */
export type RawAvailabilitySlot = {
  time: string;
  available: boolean;
  cleanersCount: number;
  /** Present when slots were scoped to a service area. */
  locationId?: string | null;
};

export type PricedAvailabilitySlot = RawAvailabilitySlot & {
  price?: number;
  duration?: number;
  surgeMultiplier?: number;
  surgeApplied?: boolean;
};

/** Applies the pricing engine per slot using roster density from availability. */
export function enrichAvailabilitySlotsWithPricing(
  raw: RawAvailabilitySlot[],
  job: PricingJobInput,
  vipTier: VipTier,
  snapshot: PricingRatesSnapshot,
): PricedAvailabilitySlot[] {
  return raw.map((s) => {
    const locEcho =
      typeof s.locationId === "string" && s.locationId.trim() ? s.locationId.trim() : undefined;
    if (!s.available) {
      return {
        time: s.time,
        available: false,
        cleanersCount: s.cleanersCount,
        ...(locEcho ? { locationId: locEcho } : {}),
      };
    }
    const q = quoteCheckoutZarWithSnapshot(snapshot, job, s.time, vipTier, {
      cleanersCount: Math.max(0, Math.round(s.cleanersCount)),
    });
    return {
      time: s.time,
      available: true,
      cleanersCount: s.cleanersCount,
      price: q.totalZar,
      duration: q.hours,
      surgeMultiplier: q.effectiveSurgeMultiplier,
      surgeApplied: q.effectiveSurgeMultiplier > 1.001,
      ...(locEcho ? { locationId: locEcho } : {}),
    };
  });
}
