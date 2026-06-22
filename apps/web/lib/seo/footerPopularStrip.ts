import { stableHash } from "@/lib/seo/anchorVariants";
import { CAPE_TOWN_SERVICE_SEO } from "@/lib/seo/capeTownSeoPages";
import { getPopularCapeTownFooterStripLinks } from "@/lib/seo/internalLinks";

export type FooterPopularStripModel = {
  title: string;
  links: { href: string; label: string }[];
};

const FOOTER_SECONDARY_VARIANTS: { href: string; label: string }[][] = [
  [
    { href: CAPE_TOWN_SERVICE_SEO["move-out-cleaning-cape-town"].path, label: "Move-out cleaning" },
    { href: CAPE_TOWN_SERVICE_SEO["carpet-cleaning-cape-town"].path, label: "Carpet cleaning" },
  ],
  [
    { href: CAPE_TOWN_SERVICE_SEO["airbnb-cleaning-cape-town"].path, label: "Airbnb cleaning" },
    { href: CAPE_TOWN_SERVICE_SEO["office-cleaning-cape-town"].path, label: "Office cleaning" },
  ],
  [
    { href: CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path, label: "Deep cleaning" },
    { href: "/book", label: "Book a cleaner" },
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
  const base = mergeFooterStripPrimaryWithVariant(getPopularCapeTownFooterStripLinks(), pathname);

  if (pathname.startsWith("/services/")) {
    return { title: "Popular cleaning services in Cape Town", links: base };
  }

  return { title: "Popular in Cape Town", links: base };
}
