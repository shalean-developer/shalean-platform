import { bookingFlowHref, bookingFlowPromoExtra } from "@/lib/booking/bookingFlow";

/**
 * When you overwrite any PNG under `public/` that the marketing homepage uses, bump this string.
 * `next/image` and browsers cache by full URL, including `?v=…`.
 */
export const MARKETING_LANDING_IMAGE_VERSION = "20260429d";

export function marketingLandingImage(path: string): string {
  return `${path}?v=${MARKETING_LANDING_IMAGE_VERSION}`;
}

/** Hero assets under `public/images/marketing/` — bump when replacing hero images. */
export const MARKETING_HERO_IMAGE_VERSION = "20260429d";

export function marketingHeroImage(filename: string): string {
  return `/images/marketing/${filename}?v=${MARKETING_HERO_IMAGE_VERSION}`;
}

/** Booking entry URL with promo + default UTM-style source (matches previous marketing home). */
export function marketingHomeBookingHref(): string {
  return bookingFlowHref("entry", { ...(bookingFlowPromoExtra("SAVE10") ?? {}), source: "marketing_home" });
}
