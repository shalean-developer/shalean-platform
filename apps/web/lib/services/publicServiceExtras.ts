import type {
  LiveExtra,
  ServicesCatalog,
} from "@/lib/booking-v2/bookingV2CatalogTypes";
import type { ServiceSlug } from "@/src/features/booking-v2/config/serviceConfig";

export const PUBLIC_EXTRAS_SERVICE_ORDER: readonly ServiceSlug[] = [
  "regular-cleaning",
  "deep-cleaning",
  "moving-cleaning",
  "airbnb-cleaning",
  "office-cleaning",
  "carpet-cleaning",
] as const;

export const PUBLIC_SERVICE_LABELS: Record<ServiceSlug, string> = {
  "regular-cleaning": "Standard Cleaning",
  "deep-cleaning": "Deep Cleaning",
  "moving-cleaning": "Move In / Out Cleaning",
  "airbnb-cleaning": "Airbnb Cleaning",
  "office-cleaning": "Office Cleaning",
  "carpet-cleaning": "Carpet Cleaning",
};

export type PublicServiceExtrasGroup = {
  slug: ServiceSlug;
  label: string;
  extras: LiveExtra[];
};

/**
 * Public prices must come only from a successful live extras-catalogue read.
 * An empty live list is authoritative and must never restore static/inactive extras.
 */
export function buildAuthoritativePublicExtrasGroups(
  catalog: ServicesCatalog,
  extrasCatalogAuthoritative: boolean,
): PublicServiceExtrasGroup[] {
  if (!extrasCatalogAuthoritative) return [];

  return PUBLIC_EXTRAS_SERVICE_ORDER.map((slug) => ({
    slug,
    label: PUBLIC_SERVICE_LABELS[slug],
    extras: catalog[slug]?.extras ?? [],
  })).filter((group) => group.extras.length > 0);
}
