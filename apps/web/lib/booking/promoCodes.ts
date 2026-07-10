export type PromoDiscountResult = {
  discountZar: number;
  description: string;
};

/**
 * Legacy hardcoded promo codes — kept for backward compatibility with the
 * old booking funnel. Prefer DB-backed promotions via `/api/promotions/validate`
 * and `lib/promotions` for booking-v2 and new campaigns.
 *
 * @deprecated Use the promotions engine for new codes.
 */
export function getPromoDiscountZar(code: string, lockedFinalPrice: number): PromoDiscountResult | null {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;

  if (normalized === "WELCOME50") {
    const discountZar = Math.min(50, lockedFinalPrice);
    return { discountZar, description: "R50 off your clean" };
  }

  if (normalized === "SAVE10") {
    const discountZar = Math.min(100, Math.round(lockedFinalPrice * 0.1));
    return { discountZar, description: "10% off (max R100)" };
  }

  if (normalized === "FIRST100") {
    const discountZar = Math.min(100, lockedFinalPrice);
    return { discountZar, description: "R100 off first booking" };
  }

  return null;
}
