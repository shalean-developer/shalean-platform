import { resolveCapeTownHubRowFromAreaInput } from "@/lib/seo/capeTownLocations";
import { nearbyProgrammaticLocationsPreferRegion } from "@/lib/seo/locations";
import { getPopularCapeTownFooterStripLinks } from "@/lib/seo/internalLinks";

export type FooterPopularStripModel = {
  title: string;
  links: { href: string; label: string }[];
};

/** Contextual heading + links for the visible footer strip (deterministic per pathname). */
export function footerPopularStripForPathname(pathname: string): FooterPopularStripModel {
  const base = getPopularCapeTownFooterStripLinks();

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
