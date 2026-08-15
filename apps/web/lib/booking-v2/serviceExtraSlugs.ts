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
    "sofa-upholstery",
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

function normalizeExtraSlug(slug: string): string {
  return slug.trim().replace(/_/g, "-");
}

export function extraSlugsForService(slug: ServiceSlug): readonly string[] {
  return SERVICE_EXTRA_SLUGS[slug];
}

/**
 * Constrain persisted/admin-configured extra slugs to the canonical service allowlist.
 * This prevents stale or misconfigured booking_v2 catalog JSON from leaking another
 * service's add-ons into the booking flow. A wholly invalid configured list falls
 * back to the canonical list so a bad config cannot hide every valid extra either.
 */
export function safeExtraSlugsForService(
  slug: ServiceSlug,
  configured: readonly string[] | null | undefined,
): readonly string[] {
  const canonical = SERVICE_EXTRA_SLUGS[slug];
  if (!configured?.length) return canonical;

  const canonicalSet = new Set(canonical);
  const safe = [...new Set(configured.map(normalizeExtraSlug))].filter((extraSlug) =>
    canonicalSet.has(extraSlug),
  );

  return safe.length > 0 ? safe : canonical;
}
