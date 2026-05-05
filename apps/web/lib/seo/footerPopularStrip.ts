import { stableHash } from "@/lib/seo/anchorVariants";
import { CAPE_TOWN_SERVICE_SEO, LOCATION_SEO_PAGES } from "@/lib/seo/capeTownSeoPages";
import { CAPE_TOWN_LOCATIONS_OVERVIEW_PATH, resolveCapeTownHubRowFromAreaInput } from "@/lib/seo/capeTownLocations";
import { nearbyProgrammaticLocationsPreferRegion } from "@/lib/seo/locations";
import { getPopularCapeTownFooterStripLinks } from "@/lib/seo/internalLinks";

export type FooterPopularStripModel = {
  title: string;
  links: { href: string; label: string }[];
};

const FOOTER_SECONDARY_VARIANTS: { href: string; label: string }[][] = [
  [
    { href: CAPE_TOWN_SERVICE_SEO["move-out-cleaning-cape-town"].path, label: "Move-out cleaning" },
    { href: LOCATION_SEO_PAGES["green-point-cleaning-services"].path, label: "Green Point cleaning" },
  ],
  [
    { href: CAPE_TOWN_SERVICE_SEO["airbnb-cleaning-cape-town"].path, label: "Airbnb cleaning" },
    { href: LOCATION_SEO_PAGES["newlands-cleaning-services"].path, label: "Newlands cleaning" },
  ],
  [
    { href: CAPE_TOWN_SERVICE_SEO["carpet-cleaning-cape-town"].path, label: "Carpet cleaning" },
    { href: LOCATION_SEO_PAGES["rondebosch-cleaning-services"].path, label: "Rondebosch cleaning" },
  ],
];

function mergeFooterStripPrimaryWithVariant(
  primary: { href: string; label: string }[],
  pathname: string,
): { href: string; label: string }[] {
  const variation = stableHash(pathname.trim() || "/") % FOOTER_SECONDARY_VARIANTS.length;
  const tail = FOOTER_SECONDARY_VARIANTS[variation] ?? [];
  const merged: { href: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const l of [...primary, ...tail]) {
    if (seen.has(l.href)) continue;
    seen.add(l.href);
    merged.push(l);
  }
  return merged.slice(0, 7);
}

/** Contextual heading + links for the visible footer strip (deterministic per pathname). */
export function footerPopularStripForPathname(pathname: string): FooterPopularStripModel {
  const baseCore = getPopularCapeTownFooterStripLinks();
  const base = mergeFooterStripPrimaryWithVariant(baseCore, pathname);

  const normalized = pathname.trim().replace(/\/+$/, "") || "/";
  if (normalized === CAPE_TOWN_LOCATIONS_OVERVIEW_PATH || normalized === "/locations/cape-town-cleaning-services") {
    return { title: "Popular in Cape Town", links: base };
  }

  if (pathname.startsWith("/services/")) {
    return { title: "Popular cleaning services in Cape Town", links: base };
  }

  if (pathname.startsWith("/locations/")) {
    const slug = pathname.slice("/locations/".length).split("/")[0] ?? "";
    if (!slug || slug === "cape-town-cleaning-services") {
      return { title: "Popular in Cape Town", links: base };
    }
    const row = resolveCapeTownHubRowFromAreaInput(slug);
    if (!row) {
      return { title: "Popular in Cape Town", links: base };
    }

    const neighbours = nearbyProgrammaticLocationsPreferRegion(slug, 5).filter((l) => l.slug !== slug);
    const regional = neighbours.map((l) => ({
      href: `/locations/${l.slug}`,
      label: `${l.name} cleaning`,
    }));

    const merged: { href: string; label: string }[] = [];
    const seen = new Set<string>();
    for (const l of [...regional, ...base.map((b) => ({ ...b }))]) {
      if (seen.has(l.href)) continue;
      seen.add(l.href);
      merged.push(l);
      if (merged.length >= 7) break;
    }

    return {
      title: `Popular in ${row.region}`,
      links: merged.slice(0, 7),
    };
  }

  return { title: "Popular in Cape Town", links: base };
}
