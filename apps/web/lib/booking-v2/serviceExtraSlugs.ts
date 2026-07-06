import type { ServiceSlug } from "@/src/features/booking-v2/config/serviceConfig";

/**
 * Canonical allowlist of `pricing_extras.slug` values per booking service.
 * Used by /book and /quote so each service type shows its own add-ons.
 */
export const SERVICE_EXTRA_SLUGS: Record<ServiceSlug, readonly string[]> = {
  "regular-cleaning": [
    "inside-cabinets",
    "inside-oven",
    "inside-fridge",
    "interior-walls",
    "ironing",
    "laundry",
    "interior-windows",
    "water-plants",
  ],
  "deep-cleaning": [
    "balcony-cleaning",
    "carpet-cleaning",
    "ceiling-cleaning",
    "garage-cleaning",
    "mattress-cleaning",
    "outside-windows",
  ],
  "moving-cleaning": [
    "inside-oven",
    "inside-cabinets",
    "interior-walls",
    "inside-fridge",
    "balcony-cleaning",
    "garage-cleaning",
    "outside-windows",
  ],
  "office-cleaning": [
    "office-kitchen",
    "interior-windows",
    "carpet-cleaning",
    "office-sanitisation",
  ],
  "carpet-cleaning": [
    "stain-treatment",
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

export function extraSlugsForService(slug: ServiceSlug): readonly string[] {
  return SERVICE_EXTRA_SLUGS[slug];
}
