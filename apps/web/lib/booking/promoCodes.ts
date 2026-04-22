export type PromoDiscountResult = {
  discountZar: number;
  description: string;
};

/**
 * Server- and client-side promo rules. Discount applies only to the locked booking subtotal (cap enforced).
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
