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

/** Blog guides — use Claremont hub articles (verified programmatic slugs). */
export const LOCATIONS_INDEX_BLOG_GUIDES: readonly { href: string; title: string; subtitle: string }[] = [
  {
    href: "/blog/home-cleaning-frequency-claremont-cape-town",
    title: "Home cleaning frequency",
    subtitle: "How often to book for Cape Town homes",
  },
  {
    href: "/blog/deep-cleaning-checklist-claremont-cape-town",
    title: "Deep cleaning checklist",
    subtitle: "Room-by-room scope before your visit",
  },
  {
    href: "/blog/move-out-cleaning-cost-claremont-cape-town",
    title: "Move-out cleaning cost",
    subtitle: "What drives quotes and deposits",
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
