import type { CapeTownLocationRow } from "@/lib/seo/capeTownLocations";
import { CAPE_TOWN_LOCATIONS } from "@/lib/seo/capeTownLocations";

/** Featured hub cards — slug must exist on `CAPE_TOWN_LOCATIONS`. */
export const LOCATIONS_INDEX_FEATURED: readonly {
  slug: string;
  descriptor: string;
}[] = [
  { slug: "sea-point-cleaning-services", descriptor: "Apartments, Airbnb, and coastal homes" },
  { slug: "claremont-cleaning-services", descriptor: "Family homes, schools, and busy kitchens" },
  { slug: "rondebosch-cleaning-services", descriptor: "UCT-adjacent rentals and quiet avenues" },
  { slug: "green-point-cleaning-services", descriptor: "Seaboard apartments near the promenade" },
  { slug: "gardens-cleaning-services", descriptor: "City Bowl flats and heritage walk-ups" },
  { slug: "durbanville-cleaning-services", descriptor: "Northern suburbs houses and townhouses" },
] as const;

export const LOCATIONS_INDEX_QUICK_SLUGS: readonly string[] = [
  "sea-point-cleaning-services",
  "claremont-cleaning-services",
  "rondebosch-cleaning-services",
  "green-point-cleaning-services",
];

/**
 * Region sections on the index (subset first for UX spec; remainder appended alphabetically).
 */
export const LOCATIONS_INDEX_REGION_ORDER: readonly string[] = [
  "Atlantic Seaboard",
  "Southern Suburbs",
  "City Bowl",
  "Northern Suburbs",
  "Blouberg",
];

/**
 * Guides from `/locations` — must target **routable** URLs (legacy programmatic `/blog/*-{area}-cape-town`
 * thin posts are not served when `NEXT_PUBLIC_LEGACY_PROGRAMMATIC_ROUTES=false`).
 */
export const LOCATIONS_INDEX_BLOG_GUIDES: readonly { href: string; title: string; subtitle: string }[] = [
  {
    href: "/locations/claremont-cleaning-services",
    title: "Claremont cleaning services",
    subtitle: "Recurring, deep, and move-out cleans with online quotes",
  },
  {
    href: "/blog/deep-cleaning-vs-regular-cleaning-cape-town",
    title: "Deep vs standard cleaning",
    subtitle: "Pick the right tier before you book",
  },
  {
    href: "/blog/move-out-cleaning-checklist-cape-town",
    title: "Move-out cleaning checklist",
    subtitle: "Handover scope for Cape Town rentals",
  },
];

export function groupCapeTownLocationsByRegion(
  locations: readonly CapeTownLocationRow[],
): Map<string, CapeTownLocationRow[]> {
  const map = new Map<string, CapeTownLocationRow[]>();
  for (const loc of locations) {
    const list = map.get(loc.region);
    if (list) list.push(loc);
    else map.set(loc.region, [loc]);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  return map;
}

export function getFeaturedLocationRows(): CapeTownLocationRow[] {
  const bySlug = new Map(CAPE_TOWN_LOCATIONS.map((r) => [r.slug, r]));
  return LOCATIONS_INDEX_FEATURED.map((f) => bySlug.get(f.slug)).filter(Boolean) as CapeTownLocationRow[];
}

export function featuredDescriptorBySlug(slug: string): string | undefined {
  return LOCATIONS_INDEX_FEATURED.find((f) => f.slug === slug)?.descriptor;
}
