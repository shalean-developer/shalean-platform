/**
 * Customer pricing source of truth.
 *
 * - New checkouts (web booking-v2 + customer-mobile) use `calculateCustomerTotal`
 *   via `/api/booking-v2/confirm`.
 * - VIP loyalty applies on booking-v2 cleaning subtotal (`VIP_APPLIES_ON_BOOKING_V2`).
 * - Legacy hardcoded promo codes remain frozen — use DB promotions only.
 * - Legacy `/api/booking/lock` is permanently retired and cannot be re-enabled by env.
 */
export const CUSTOMER_PRICING_SOT = "booking_v2" as const;

export type CustomerPricingSot = typeof CUSTOMER_PRICING_SOT;

/** Legacy hardcoded promo codes are retired. Use DB promotions. */
export const LEGACY_HARDCODED_PROMOS_ENABLED = false;
