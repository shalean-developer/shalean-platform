/**
 * Phase 2 VIP policy for booking-v2.
 *
 * VIP loyalty discounts (user_profiles.tier) apply on the **cleaning service
 * subtotal** (base + property factors + extras + extra cleaners) before
 * equipment logistics and service fee — same economic intent as legacy
 * `quoteCheckoutZarWithSnapshot` VIP step, without surge/charm.
 *
 * Do not also apply a membership/promo that duplicates the same loyalty %;
 * promotions engine remains separate (campaigns / codes / membership plans).
 */

import {
  getVipDiscountMultiplier,
  normalizeVipTier,
  type VipTier,
} from "@shalean/types/vipTier";

export { getVipDiscountMultiplier, normalizeVipTier, type VipTier };

/** VIP is enabled on booking-v2 SoT (Phase 2). */
export const VIP_APPLIES_ON_BOOKING_V2 = true as const;

export type VipDiscountResult = {
  vipTier: VipTier;
  /** Multiplier applied to cleaning subtotal (1 = none). */
  vipMultiplier: number;
  /** ZAR removed from cleaning subtotal (rounded). */
  vipDiscountZar: number;
  /** Cleaning subtotal after VIP. */
  cleaningSubtotalAfterVipZar: number;
};

/**
 * Apply VIP to cleaning service subtotal (integer ZAR).
 * Equipment + service fee are computed on the post-VIP cleaning amount + fees.
 */
export function applyVipToCleaningSubtotalZar(
  cleaningServiceSubtotalZar: number,
  tier: VipTier | string | null | undefined,
): VipDiscountResult {
  const vipTier = normalizeVipTier(tier);
  const raw = Math.max(0, Math.round(cleaningServiceSubtotalZar));
  const vipMultiplier = getVipDiscountMultiplier(vipTier);
  const cleaningSubtotalAfterVipZar = Math.max(0, Math.round(raw * vipMultiplier));
  const vipDiscountZar = Math.max(0, raw - cleaningSubtotalAfterVipZar);
  return {
    vipTier,
    vipMultiplier,
    vipDiscountZar,
    cleaningSubtotalAfterVipZar,
  };
}
