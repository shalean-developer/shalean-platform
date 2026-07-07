/**
 * Canonical Cape Town suburb catalogue for `/locations/[slug]`.
 * Source of truth: `data/location-hubs.json` (slug, enrichment: locationType, propertyTypes, pricingBand, optional serviceDemandProfile / localizedFaq).
 * Editorial blocks live in `LOCATION_SEO_PAGES` (`capeTownSeoPages.ts`).
 */

import hubsFile from "./data/location-hubs.json";
import type { LocationPricingBandId } from "./location-pricing";

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
  /** 2–4 short demand lines — rendered once per hub for locality (see `location-hubs.json`). */
  readonly serviceDemandProfile?: readonly string[];
  /** One suburb-specific FAQ merged into hub FAQ + JSON-LD (see `location-hubs.json`). */
  readonly localizedFaq?: { readonly q: string; readonly a: string };
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

/**
 * City-wide overview hub. The legacy commercial page `/cleaning-services-cape-town` is retired
 * (HTTP 410 via `isSeoRebuildGonePath`), so the live city overview is the `/locations` index.
 */
export const CAPE_TOWN_LOCATIONS_OVERVIEW_PATH = "/locations" as const;

/**
 * Resolve a hub row from user/CMS input: full hub slug (`sea-point-cleaning-services`), short legacy slug
 * (`sea-point`), or slugified area (`table-view` ↔ "Table View"). Unknown → undefined.
 */
export function resolveCapeTownHubRowFromAreaInput(raw: string): CapeTownLocationRow | undefined {
  const key = raw.trim().toLowerCase().replace(/^\/+|\/+$/g, "");
  if (!key) return undefined;

  const exact = CAPE_TOWN_LOCATIONS.find((l) => l.slug === key);
  if (exact) return exact;

  const composite = key.endsWith(HUB_SUFFIX) ? key : `${key}${HUB_SUFFIX}`;
  const byComposite = CAPE_TOWN_LOCATIONS.find((l) => l.slug === composite);
  if (byComposite) return byComposite;

  const spaced = key.replace(/-/g, " ");
  return CAPE_TOWN_LOCATIONS.find((l) => l.name.toLowerCase() === spaced);
}

/**
 * Single source of truth for `/locations/*` hrefs: only catalogue slugs or the static Cape Town overview.
 * Never synthesise `-cleaning-services` from arbitrary slugify output — avoids 404s.
 */
export function locationHubPathFromAreaInput(raw: string): typeof CAPE_TOWN_LOCATIONS_OVERVIEW_PATH | `/locations/${string}` | "/locations" {
  const key = raw.trim().toLowerCase().replace(/^\/+|\/+$/g, "");
  if (key === "cape-town" || key === "cape-town-cleaning-services" || key === "cleaning-services-cape-town") {
    return CAPE_TOWN_LOCATIONS_OVERVIEW_PATH;
  }
  const row = resolveCapeTownHubRowFromAreaInput(raw);
  if (!row) return "/locations";
  return `/locations/${row.slug}`;
}

/** Resolve catalogue row from programmatic `post.location` labels (e.g. \"Sea Point\"). */
export function capeTownLocationRowFromPlaceName(placeName: string): CapeTownLocationRow | null {
  const n = placeName.trim().toLowerCase();
  return CAPE_TOWN_LOCATIONS.find((l) => l.name.toLowerCase() === n) ?? null;
}
