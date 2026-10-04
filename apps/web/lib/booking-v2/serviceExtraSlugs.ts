import type { ServiceSlug } from "@/src/features/booking-v2/config/serviceConfig";

/**
 * Canonical allowlist of `pricing_extras.slug` values per booking service.
 * Used by /book and /quote so each service type shows its own add-ons.
 * Aligned with Farai UAT Batch 2 (UAT-BOOK-010).
 */
export const SERVICE_EXTRA_SLUGS: Record<ServiceSlug, readonly string[]> = {
  "regular-cleaning": [
    "inside-fridge",
    "inside-oven",
    "laundry",
    "ironing",
    "interior-windows",
  ],
  "deep-cleaning": [
    "balcony-cleaning",
    "deep-carpet-cleaning",
    "ceiling-cleaning",
    "garage-cleaning",
    "mattress-cleaning",
    "outside-windows",
  ],
  "moving-cleaning": [
    "balcony-cleaning",
    "deep-carpet-cleaning",
    "ceiling-cleaning",
    "garage-cleaning",
    "mattress-cleaning",
    "outside-windows",
  ],
  "office-cleaning": [
    "office-kitchen",
    "office-sanitisation",
    "waste-removal",
  ],
  "carpet-cleaning": [
    "sofa-upholstery",
    "pet-odour-treatment",
    "fabric-protector",
    "mattress-cleaning",
  ],
  "airbnb-cleaning": [
    "laundry",
    "inside-oven",
    "welcome-setup",
    "interior-windows",
    "inspection-photos",
  ],
};

const SERVICE_EXTRA_SLUG_SETS: Record<ServiceSlug, ReadonlySet<string>> = {
  "regular-cleaning": new Set(SERVICE_EXTRA_SLUGS["regular-cleaning"]),
  "deep-cleaning": new Set(SERVICE_EXTRA_SLUGS["deep-cleaning"]),
  "moving-cleaning": new Set(SERVICE_EXTRA_SLUGS["moving-cleaning"]),
  "office-cleaning": new Set(SERVICE_EXTRA_SLUGS["office-cleaning"]),
  "carpet-cleaning": new Set(SERVICE_EXTRA_SLUGS["carpet-cleaning"]),
  "airbnb-cleaning": new Set(SERVICE_EXTRA_SLUGS["airbnb-cleaning"]),
};

export function extraSlugsForService(slug: ServiceSlug): readonly string[] {
  return SERVICE_EXTRA_SLUGS[slug];
}

/**
 * Customer-facing add-ons are contract-owned by Booking V2.
 * The database still owns the price and active state, but a stale service_slugs
 * assignment must never make an add-on appear on the wrong service.
 */
export function isExtraSlugAllowedForService(serviceSlug: ServiceSlug, extraSlug: string): boolean {
  return SERVICE_EXTRA_SLUG_SETS[serviceSlug].has(extraSlug.trim());
}
