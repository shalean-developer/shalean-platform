/**
 * Phase 1–4 customer pricing SoT.
 *
 * - New checkouts (web booking-v2 + customer-mobile) use `calculateCustomerTotal`
 *   via `/api/booking-v2/confirm`.
 * - VIP loyalty applies on booking-v2 cleaning subtotal (`VIP_APPLIES_ON_BOOKING_V2`).
 * - Legacy hardcoded promo codes remain frozen — use DB promotions only.
 * - New `/api/booking/lock` writes require LEGACY_BOOKING_LOCK_ENABLED=true (Phase 4).
 */
export const CUSTOMER_PRICING_SOT = "booking_v2" as const;

export type CustomerPricingSot = typeof CUSTOMER_PRICING_SOT;

/** Legacy hardcoded promo codes are retired (Phase 2). Use DB promotions. */
export const LEGACY_HARDCODED_PROMOS_ENABLED = false;

/** New lock quotes are disabled unless ops explicitly re-enables the legacy funnel. */
export function isLegacyBookingLockEnabled(): boolean {
  return String(process.env.LEGACY_BOOKING_LOCK_ENABLED ?? "")
    .trim()
    .toLowerCase() === "true";
}
