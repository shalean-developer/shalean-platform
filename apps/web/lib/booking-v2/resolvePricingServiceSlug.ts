import type { ServiceSlug } from "@/src/features/booking-v2/config/serviceConfig";
import { DB_SLUG_MAP } from "@/lib/booking-v2/loadBookingV2CatalogMaps";

/**
 * Canonical engine slugs (`standard`, `deep`, …) plus marketing / admin variants
 * seen on staging (`standard-cleaning`, `deep-cleaning`, …).
 *
 * Staging historically seeded SEO-style slugs while booking-v2 + legacy engines
 * look up short engine ids — without aliases, room rates resolve to 0 and the
 * quote appears "not calculating".
 */
export const PRICING_SERVICE_SLUG_ALIASES: Readonly<Record<string, readonly string[]>> = {
  standard: ["standard", "standard-cleaning", "regular", "regular-cleaning"],
  deep: ["deep", "deep-cleaning"],
  move: ["move", "move-in", "move-out", "moving", "moving-cleaning", "moving-in-cleaning"],
  airbnb: ["airbnb", "airbnb-cleaning"],
  carpet: ["carpet", "carpet-cleaning"],
  quick: ["quick", "office", "office-cleaning"],
};

/** All candidate DB slugs for a canonical engine (or already-canonical) pricing slug. */
export function pricingServiceSlugCandidates(pricingSlug: string): string[] {
  const key = pricingSlug.trim().toLowerCase();
  if (!key) return [];
  const fromAlias = PRICING_SERVICE_SLUG_ALIASES[key];
  if (fromAlias) return [...fromAlias];
  for (const [canonical, aliases] of Object.entries(PRICING_SERVICE_SLUG_ALIASES)) {
    if (aliases.includes(key)) {
      return [canonical, ...aliases.filter((a) => a !== canonical)];
    }
  }
  return [key];
}

/** Resolve a pricing_services row by canonical slug or known alias. */
export function resolvePricingServiceRow<T>(
  dbServices: Record<string, T>,
  pricingSlug: string,
): T | null {
  for (const candidate of pricingServiceSlugCandidates(pricingSlug)) {
    const row = dbServices[candidate];
    if (row != null) return row;
  }
  return null;
}

/** Engine pricing slug for a booking-v2 service (before DB alias resolution). */
export function enginePricingSlugForBookingV2(serviceSlug: ServiceSlug): string {
  return DB_SLUG_MAP[serviceSlug];
}
