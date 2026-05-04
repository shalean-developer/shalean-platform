import { CAPE_TOWN_LOCATIONS } from "@/lib/seo/capeTownLocations";
import { LOCATION_SEO_PAGES, type LocationSeoSlug } from "@/lib/seo/capeTownSeoPages";

export type ServicesHubAreaLink = {
  label: string;
  href: string;
};

/** Display order for `/services` “Areas we serve” grid. */
export const SERVICES_HUB_REGION_ORDER = [
  "Atlantic Seaboard",
  "City Bowl",
  "Southern Suburbs",
  "Northern Suburbs",
  "Blouberg",
] as const;

export function getServicesHubAreasByRegion(): { region: string; items: ServicesHubAreaLink[] }[] {
  const bucket = new Map<string, ServicesHubAreaLink[]>();

  for (const row of CAPE_TOWN_LOCATIONS) {
    const block = LOCATION_SEO_PAGES[row.slug as LocationSeoSlug];
    if (!block?.path) continue;
    const region = row.region.trim();
    const link: ServicesHubAreaLink = {
      label: row.name,
      href: block.path,
    };
    const list = bucket.get(region) ?? [];
    list.push(link);
    bucket.set(region, list);
  }

  for (const [, items] of bucket) {
    items.sort((a, b) => a.label.localeCompare(b.label));
  }

  const ordered: { region: string; items: ServicesHubAreaLink[] }[] = [];
  const seen = new Set<string>();

  for (const r of SERVICES_HUB_REGION_ORDER) {
    const items = bucket.get(r);
    if (items?.length) {
      ordered.push({ region: r, items });
      seen.add(r);
    }
  }

  for (const [region, items] of bucket) {
    if (!seen.has(region) && items.length) {
      ordered.push({ region, items });
    }
  }

  return ordered;
}
