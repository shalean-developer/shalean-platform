/**
 * @deprecated Phase 2 — hardcoded promo codes retired.
 * All customer discounts go through DB promotions (`/api/promotions/validate`
 * + `evaluateCheckoutPromotions`). This module remains only so old imports
 * fail closed (always null).
 */

import { LEGACY_HARDCODED_PROMOS_ENABLED } from "@/lib/booking/customerPricingSot";

export type PromoDiscountResult = {
  discountZar: number;
  description: string;
};

/** @deprecated Always returns null. Use `/api/promotions/validate`. */
export function getPromoDiscountZar(_code: string, _lockedFinalPrice: number): PromoDiscountResult | null {
  void LEGACY_HARDCODED_PROMOS_ENABLED;
  return null;
}
