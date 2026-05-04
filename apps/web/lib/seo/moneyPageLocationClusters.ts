import { LOCATION_SEO_PAGES } from "@/lib/seo/capeTownSeoPages";

/** High-intent hubs surfaced on maid + pricing money pages (explore + keyword internal links). */
const MONEY_PAGE_HUB_ROWS = [
  { slug: "sea-point-cleaning-services", label: "Sea Point" },
  { slug: "claremont-cleaning-services", label: "Claremont" },
  { slug: "constantia-cleaning-services", label: "Constantia" },
  { slug: "green-point-cleaning-services", label: "Green Point" },
  { slug: "rondebosch-cleaning-services", label: "Rondebosch" },
  { slug: "observatory-cleaning-services", label: "Observatory" },
  { slug: "woodstock-cleaning-services", label: "Woodstock" },
  { slug: "newlands-cleaning-services", label: "Newlands" },
  { slug: "zonnebloem-cleaning-services", label: "Cape Town CBD" },
] as const;

export type MoneyPageExploreHub = {
  readonly href: string;
  readonly label: string;
  readonly anchor: string;
};

export type MoneyPageAuthorityKeywordLink = {
  readonly href: string;
  readonly text: string;
};

/** Short labels + “Cleaning services in …” titles for explore lists. */
export function moneyPageExploreAreaHubs(): MoneyPageExploreHub[] {
  return MONEY_PAGE_HUB_ROWS.map(({ slug, label }) => {
    const path = LOCATION_SEO_PAGES[slug].path;
    const anchor =
      slug === "zonnebloem-cleaning-services"
        ? "Cleaning services in Cape Town CBD (Zonnebloem)"
        : `Cleaning services in ${label}`;
    return { href: path, label, anchor };
  });
}

/** Keyword-rich anchors (“{Area} cleaning services”) for suburb authority blocks. */
export function moneyPageSuburbAuthorityKeywordLinks(): MoneyPageAuthorityKeywordLink[] {
  return MONEY_PAGE_HUB_ROWS.map(({ slug, label }) => ({
    href: LOCATION_SEO_PAGES[slug].path,
    text: `${label} cleaning services`,
  }));
}
