/**
 * Checkout total: locked quote from step 2 + tip − discount.
 * `lockedFinalPrice` already includes VIP and slot multipliers from `quoteCheckoutZar` — do not apply VIP again.
 */
export function computeCheckoutTotalZar(lockedFinalPrice: number, tipZar: number, discountZar: number): number {
  const raw = lockedFinalPrice + tipZar - discountZar;
  return Math.max(1, Math.round(raw));
}

export const MAX_TIP_ZAR = 5_000;
