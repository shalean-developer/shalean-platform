/**
 * Canonical Cape Town suburb catalogue for `/locations/[slug]`.
 * Source of truth: `data/location-hubs.json` (slug, enrichment: locationType, propertyTypes, pricingBand).
 * Editorial blocks live in `LOCATION_SEO_PAGES` (`capeTownSeoPages.ts`).
 */

import hubsFile from "@/lib/seo/data/location-hubs.json";
import type { LocationPricingBandId } from "@/lib/seo/location-pricing";

export const HUB_SUFFIX = "-cleaning-services" as const;

export type LocationEnvironmentType = "coastal" | "urban" | "suburban" | "estate" | "northern" | "blouberg";

export type LocationPropertyType =
  | "apartment"
  | "family_home"
  | "short_stay"
  | "luxury_home"
  | "student_share"
  | "townhouse";

export type CapeTownLocationRow = {
  readonly slug: string;
  readonly name: string;
  readonly region: string;
  readonly city: string;
  readonly nearby: readonly string[];
  readonly uniqueContextLine: string;
  readonly locationType: LocationEnvironmentType;
  readonly propertyTypes: readonly LocationPropertyType[];
  readonly pricingBand: LocationPricingBandId;
};

type LocationHubFile = {
  version: number;
  locations: CapeTownLocationRow[];
};

function normalizeHubs(raw: LocationHubFile): readonly CapeTownLocationRow[] {
  if (raw.version !== 1) {
    throw new Error(`location-hubs.json: unsupported version ${raw.version}`);
  }
  if (!Array.isArray(raw.locations) || raw.locations.length === 0) {
    throw new Error("location-hubs.json: locations[] required");
  }
  return raw.locations;
}

export const CAPE_TOWN_LOCATIONS = normalizeHubs(hubsFile as LocationHubFile);

export type CapeTownLocationSlug = (typeof CAPE_TOWN_LOCATIONS)[number]["slug"];

/** Resolve catalogue row from programmatic `post.location` labels (e.g. \"Sea Point\"). */
export function capeTownLocationRowFromPlaceName(placeName: string): CapeTownLocationRow | null {
  const n = placeName.trim().toLowerCase();
  return CAPE_TOWN_LOCATIONS.find((l) => l.name.toLowerCase() === n) ?? null;
}
