import type { HomeLocation } from "@/lib/home/data";
import { locationHubPathFromAreaInput } from "@/lib/seo/capeTownLocations";
import { PROGRAMMATIC_LOCATIONS } from "@/lib/seo/locations";

export type SuburbAreaLink = { name: string; href: string | null };

/** Resolve a display name to a catalogue hub path when the suburb exists in SEO hubs. */
export function suburbHrefByDisplayName(name: string): string | null {
  const match = PROGRAMMATIC_LOCATIONS.find(
    (loc) => loc.name.toLowerCase() === name.trim().toLowerCase(),
  );
  return match ? `/locations/${match.slug}` : null;
}

/**
 * Hub path for a DB/service-area slug. Never invents `/locations/{short-slug}` pages —
 * unknown suburbs map to `/locations` (overview).
 */
export function suburbHrefFromAreaSlug(slug: string | null | undefined): string | null {
  const key = slug?.trim();
  if (!key) return null;
  return locationHubPathFromAreaInput(key);
}

/**
 * Homepage / marketing areas chip list: catalogue hubs first, then remaining DB areas
 * resolved through `locationHubPathFromAreaInput` so live internal links never 404.
 */
export function mergeSuburbAreaLinks(locations: readonly HomeLocation[]): SuburbAreaLink[] {
  const seen = new Set<string>();
  const links: SuburbAreaLink[] = [];
  for (const loc of PROGRAMMATIC_LOCATIONS) {
    if (seen.has(loc.name)) continue;
    seen.add(loc.name);
    links.push({ name: loc.name, href: `/locations/${loc.slug}` });
  }
  for (const loc of locations) {
    if (seen.has(loc.name)) continue;
    seen.add(loc.name);
    links.push({
      name: loc.name,
      href: suburbHrefFromAreaSlug(loc.slug) ?? suburbHrefByDisplayName(loc.name),
    });
  }
  return links.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}
