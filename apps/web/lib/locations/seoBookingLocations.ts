import { CAPE_TOWN_LOCATIONS, HUB_SUFFIX } from "@/lib/seo/capeTownLocations";

/**
 * Canonical booking/marketing location row (short slug + SEO path segment).
 * Source of truth for labels/regions: `CAPE_TOWN_LOCATIONS`.
 */
export type BookingLocationRecord = {
  /** Display name, e.g. "Claremont" */
  label: string;
  /** URL slug without hub suffix, e.g. "claremont" */
  slug: string;
  /** Raw region from catalogue, e.g. "Southern Suburbs" */
  region: string;
  /** Group heading in the picker (may differ for UX), e.g. "Cape Town Central" */
  regionDisplay: string;
  city: string;
  /** Full `[slug]` segment for `/locations/[slug]`, e.g. "claremont-cleaning-services" */
  seoSlug: string;
};

/** Maps raw `region` from data to list section titles. */
export const REGION_DISPLAY_LABELS: Record<string, string> = {
  "City Bowl": "Cape Town Central",
  "Atlantic Seaboard": "Atlantic Seaboard",
  "Southern Suburbs": "Southern Suburbs",
  "Northern Suburbs": "Northern Suburbs",
  Blouberg: "Blouberg",
};

export const REGION_SECTION_ORDER: string[] = [
  "Cape Town Central",
  "Atlantic Seaboard",
  "Southern Suburbs",
  "Northern Suburbs",
  "Blouberg",
];

export function regionDisplayHeading(region: string): string {
  return REGION_DISPLAY_LABELS[region] ?? region;
}

function shortSlugFromSeoSlug(seoSlug: string): string {
  if (seoSlug.endsWith(HUB_SUFFIX)) {
    return seoSlug.slice(0, -HUB_SUFFIX.length);
  }
  return seoSlug;
}

export const BOOKING_LOCATION_CATALOG: BookingLocationRecord[] = CAPE_TOWN_LOCATIONS.map((row) => {
  const slug = shortSlugFromSeoSlug(row.slug);
  return {
    label: row.name,
    slug,
    region: row.region,
    city: row.city,
    seoSlug: row.slug,
    regionDisplay: regionDisplayHeading(row.region),
  };
});

export function locationCleaningServicesHref(record: Pick<BookingLocationRecord, "slug">): string {
  return `/locations/${record.slug}-cleaning-services`;
}
