import { CAPE_TOWN_LOCATIONS } from "@/lib/seo/capeTownLocations";

/** Map programmatic/editorial “place” labels to `/locations/*` hub paths for bidirectional internal links. */
export function locationHubHrefFromPlaceName(placeName: string | undefined): string | null {
  if (!placeName?.trim()) return null;
  const n = placeName.trim().toLowerCase();
  const row = CAPE_TOWN_LOCATIONS.find((l) => l.name.toLowerCase() === n);
  return row ? `/locations/${row.slug}` : null;
}

/** Hub slug for programmatic `/locations/[slug]` (e.g. `sea-point-cleaning-services`). */
export function hubSlugFromPlaceName(placeName: string | undefined): string | null {
  if (!placeName?.trim()) return null;
  const n = placeName.trim().toLowerCase();
  const row = CAPE_TOWN_LOCATIONS.find((l) => l.name.toLowerCase() === n);
  return row?.slug ?? null;
}
