import {
  CAPE_TOWN_LOCATIONS_OVERVIEW_PATH,
  locationHubPathFromAreaInput,
  resolveCapeTownHubRowFromAreaInput,
} from "@/lib/seo/capeTownLocations";

function titleCaseFromHyphen(key: string): string {
  return key
    .split("-")
    .filter(Boolean)
    .map((w) => w.slice(0, 1).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Resolves the canonical `/locations/*` hub for editorial slugs
 * `cleaning-services-{area}-cape-town` (e.g. claremont → /locations/claremont-cleaning-services).
 * City-wide and unknown areas return null.
 */
export function resolveHubFromCleaningServicesCapeTownBlogSlug(
  slug: string,
): { href: string; placeName: string } | null {
  const s = slug.trim().toLowerCase();
  const m = /^cleaning-services-(.+)-cape-town$/.exec(s);
  if (!m) return null;
  const areaKey = m[1] ?? "";
  const path = locationHubPathFromAreaInput(areaKey);
  if (path === "/locations" || path === CAPE_TOWN_LOCATIONS_OVERVIEW_PATH) {
    return null;
  }
  const row = resolveCapeTownHubRowFromAreaInput(areaKey);
  return { href: path, placeName: row?.name ?? titleCaseFromHyphen(areaKey) };
}
