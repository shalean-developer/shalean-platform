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
    "inside-cabinets",
    "inside-wardrobes",
    "blinds-cleaning",
    "interior-walls",
  ],
  "moving-cleaning": [
    "deposit-preparation",
    "appliances-cleaning",
    "inside-cabinets",
    "garage-cleaning",
  ],
  "office-cleaning": [
    "office-kitchen",
    "office-sanitisation",
    "waste-removal",
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
