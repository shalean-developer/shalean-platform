import type { BlogServiceLinkKind } from "@/lib/blog/getBlogServiceType";
import { getBlogServiceType } from "@/lib/blog/getBlogServiceType";
import { pickGeoHubAnchor, pickPricingBlogAnchor, pickServiceLocationAnchor, stableHash } from "@/lib/seo/anchorVariants";
import {
  CAPE_TOWN_SERVICE_SEO,
  LOCATION_SEO_PAGES,
  capeTownSeoLocationLinks,
  serviceHubLocationLinks,
  type CapeTownSeoServiceSlug,
  type LocationSeoSlug,
} from "@/lib/seo/capeTownSeoPages";

/** Keyword-rich cross-page internal link (render `anchor` as link text). */
export type SeoInternalLink = { href: string; anchor: string };

/** Canonical pricing guide used across hubs + blogs. */
export const CAPE_TOWN_PRICING_BLOG_HREF = "/blog/how-much-does-cleaning-cost-cape-town";

/**
 * Priority suburb hubs for service pages and blog topic clusters.
 * Order is intentional (Atlantic Seaboard → Southern Suburbs → City Bowl).
 */
export const PRIORITY_CAPE_TOWN_HUB_SLUGS = [
  "sea-point-cleaning-services",
  "claremont-cleaning-services",
  "green-point-cleaning-services",
  "gardens-cleaning-services",
] as const satisfies readonly LocationSeoSlug[];

export function getPricingBlogLink(slugKey?: string): SeoInternalLink {
  const key = (slugKey ?? "blog").trim() || "blog";
  return {
    href: CAPE_TOWN_PRICING_BLOG_HREF,
    anchor: pickPricingBlogAnchor(`${key}|cluster`),
  };
}

function blogServicePhraseStandard(slugKey: string, role: "standard" | "deep"): string {
  const k = `${slugKey}|${role}|phrase`;
  const variants =
    role === "standard"
      ? ["Standard cleaning service", "Standard home cleaning", "Recurring standard cleaning"]
      : ["Deep cleaning service", "Deep home cleaning", "One-off deep cleaning"];
  const idx = stableHash(k) % variants.length;
  return variants[idx]!;
}

/** Down-links for the blog cluster — deterministic anchor variants per post slug. */
export function getBlogCoreServiceLinks(slugKey: string): SeoInternalLink[] {
  const key = slugKey.trim() || "blog";
  const stdPhrase = blogServicePhraseStandard(key, "standard");
  const deepPhrase = blogServicePhraseStandard(key, "deep");
  const city = "Cape Town";
  return [
    {
      href: CAPE_TOWN_SERVICE_SEO["standard-cleaning-cape-town"].path,
      anchor: pickServiceLocationAnchor(`${key}|svc|standard`, stdPhrase, city),
    },
    {
      href: CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path,
      anchor: pickServiceLocationAnchor(`${key}|svc|deep`, deepPhrase, city),
    },
  ];
}

/** Two service URLs tuned to inferred intent (≤2 hrefs; pairs with locations + pricing in the cluster). */
export function getBlogIntentServicePair(kind: BlogServiceLinkKind, slugKey: string): SeoInternalLink[] {
  const key = slugKey.trim() || "blog";
  const city = "Cape Town";

  const link = (slug: CapeTownSeoServiceSlug, roleKey: string, phrase: string): SeoInternalLink => ({
    href: CAPE_TOWN_SERVICE_SEO[slug].path,
    anchor: pickServiceLocationAnchor(`${key}|intent|${roleKey}`, phrase, city),
  });

  if (kind === "airbnb") {
    return [
      link("airbnb-cleaning-cape-town", "airbnb", "Airbnb turnover cleaning"),
      link("standard-cleaning-cape-town", "standard", "Standard home cleaning"),
    ];
  }
  if (kind === "move-out") {
    return [
      link("move-out-cleaning-cape-town", "moveout", "Move-out cleaning"),
      link("deep-cleaning-cape-town", "deep", "Deep cleaning"),
    ];
  }
  if (kind === "carpet") {
    return [
      link("carpet-cleaning-cape-town", "carpet", "Carpet cleaning"),
      link("standard-cleaning-cape-town", "standard", "Standard home cleaning"),
    ];
  }
  if (kind === "deep") {
    return [
      link("deep-cleaning-cape-town", "deep", "Deep cleaning service"),
      link("standard-cleaning-cape-town", "standard", "Standard cleaning service"),
    ];
  }
  /* pricing + standard default */
  return getBlogCoreServiceLinks(key);
}

/** Sideways links into high-authority `/locations/*` hubs (pair per layout budget). */
export function getBlogExploreLocationLinks(slugKey: string): SeoInternalLink[] {
  return getRelevantBlogLocationLinks("standard", slugKey).slice(0, 2);
}

/** Optional third hub for lists that allow an extra CBD-oriented sideways link. */
export function getBlogExploreLocationLinkGardensCbd(slugKey: string): SeoInternalLink {
  const key = slugKey.trim() || "blog";
  return {
    href: LOCATION_SEO_PAGES["gardens-cleaning-services"].path,
    anchor: pickGeoHubAnchor(`${key}|hub|gardens`, "Gardens"),
  };
}

function intentLocationHubTriples(kind: BlogServiceLinkKind): readonly [LocationSeoSlug, string, string][] {
  switch (kind) {
    case "pricing":
      return [
        ["gardens-cleaning-services", "cbd", "Gardens"],
        ["zonnebloem-cleaning-services", "bowl", "Zonnebloem"],
        ["sea-point-cleaning-services", "metro", "Sea Point"],
      ];
    case "airbnb":
      return [
        ["sea-point-cleaning-services", "str1", "Sea Point"],
        ["green-point-cleaning-services", "str2", "Green Point"],
        ["camps-bay-cleaning-services", "str3", "Camps Bay"],
      ];
    case "move-out":
      return [
        ["claremont-cleaning-services", "mo1", "Claremont"],
        ["newlands-cleaning-services", "mo2", "Newlands"],
        ["rondebosch-cleaning-services", "mo3", "Rondebosch"],
      ];
    case "carpet":
      return [
        ["claremont-cleaning-services", "cp1", "Claremont"],
        ["sea-point-cleaning-services", "cp2", "Sea Point"],
        ["wynberg-cleaning-services", "cp3", "Wynberg"],
      ];
    case "deep":
      return [
        ["claremont-cleaning-services", "dp1", "Claremont"],
        ["sea-point-cleaning-services", "dp2", "Sea Point"],
        ["green-point-cleaning-services", "dp3", "Green Point"],
      ];
    default:
      return [
        ["claremont-cleaning-services", "fam1", "Claremont"],
        ["rondebosch-cleaning-services", "fam2", "Rondebosch"],
        ["newlands-cleaning-services", "fam3", "Newlands"],
      ];
  }
}

/** Topic-matched suburb hubs for blog clusters (3 links, deduped). */
export function getRelevantBlogLocationLinks(kind: BlogServiceLinkKind, slugKey: string): SeoInternalLink[] {
  const key = slugKey.trim() || "blog";
  const out: SeoInternalLink[] = [];
  const seen = new Set<string>();
  for (const [locSlug, seed, place] of intentLocationHubTriples(kind)) {
    const block = LOCATION_SEO_PAGES[locSlug];
    if (!block?.path) continue;
    if (seen.has(block.path)) continue;
    seen.add(block.path);
    out.push({
      href: block.path,
      anchor: pickGeoHubAnchor(`${key}|intent|${seed}`, place),
    });
  }
  return out;
}

/**
 * Location hub → conversion services + pricing guide (DOWN + sideways authority).
 */
export function getLocationHubRelatedServiceLinks(suburbDisplayName: string, hubSlugKey: string): SeoInternalLink[] {
  const s = suburbDisplayName.trim();
  const key = hubSlugKey.trim() || "hub";
  return [
    {
      href: CAPE_TOWN_SERVICE_SEO["standard-cleaning-cape-town"].path,
      anchor: pickServiceLocationAnchor(`${key}|hubrel|standard`, "Standard cleaning services", s),
    },
    {
      href: CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path,
      anchor: pickServiceLocationAnchor(`${key}|hubrel|deep`, "Deep cleaning services", s),
    },
    {
      href: CAPE_TOWN_SERVICE_SEO["move-out-cleaning-cape-town"].path,
      anchor: pickServiceLocationAnchor(`${key}|hubrel|moveout`, "Move-out cleaning services", s),
    },
    {
      href: CAPE_TOWN_PRICING_BLOG_HREF,
      anchor: pickPricingBlogAnchor(`${key}|hubrel|pricing`),
    },
  ];
}

/** First screen internal link on blog posts — primary service destination by slug intent. */
export function getBlogAboveFoldServiceLink(slug: string): SeoInternalLink {
  const key = slug.trim() || "blog";
  const kind = getBlogServiceType(slug);
  const city = "Cape Town";

  if (kind === "airbnb") {
    return {
      href: CAPE_TOWN_SERVICE_SEO["airbnb-cleaning-cape-town"].path,
      anchor: pickServiceLocationAnchor(`${key}|fold|airbnb`, "Airbnb turnover cleaning", city),
    };
  }
  if (kind === "move-out") {
    return {
      href: CAPE_TOWN_SERVICE_SEO["move-out-cleaning-cape-town"].path,
      anchor: pickServiceLocationAnchor(`${key}|fold|moveout`, "Move-out cleaning", city),
    };
  }
  if (kind === "carpet") {
    return {
      href: CAPE_TOWN_SERVICE_SEO["carpet-cleaning-cape-town"].path,
      anchor: pickServiceLocationAnchor(`${key}|fold|carpet`, "Professional carpet cleaning", city),
    };
  }
  if (kind === "deep") {
    return {
      href: CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path,
      anchor: pickServiceLocationAnchor(`${key}|fold|deep`, "Deep cleaning", city),
    };
  }
  if (kind === "pricing") {
    return {
      href: CAPE_TOWN_SERVICE_SEO["standard-cleaning-cape-town"].path,
      anchor: pickServiceLocationAnchor(`${key}|fold|pricing`, "Standard cleaning bookings", city),
    };
  }
  return {
    href: CAPE_TOWN_SERVICE_SEO["standard-cleaning-cape-town"].path,
    anchor: pickServiceLocationAnchor(`${key}|fold|standard`, "Standard home cleaning", city),
  };
}

/** First screen link on location hubs — standard cleaning framed for the suburb. */
export function getLocationHubAboveFoldServiceLink(suburbDisplayName: string, hubSlugKey: string): SeoInternalLink {
  const s = suburbDisplayName.trim();
  const key = hubSlugKey.trim() || "hub";
  return {
    href: CAPE_TOWN_SERVICE_SEO["standard-cleaning-cape-town"].path,
    anchor: pickServiceLocationAnchor(`${key}|fold|local`, "Standard cleaning", s),
  };
}

/** Inline “See pricing” line on Cape Town service SEO pages. */
export function getServicePagePricingBlogInlineLink(serviceSlug: CapeTownSeoServiceSlug): SeoInternalLink {
  return {
    href: CAPE_TOWN_PRICING_BLOG_HREF,
    anchor: pickPricingBlogAnchor(`${serviceSlug}|service-inline`),
  };
}

const BLOG_DEEP_VS_STANDARD = "/blog/deep-vs-standard-cleaning-cape-town";
const BLOG_MOVE_OUT_CHECKLIST = "/blog/move-out-cleaning-checklist-cape-town";
const BLOG_AIRBNB_HOST_TIPS = "/blog/best-airbnb-cleaning-tips-cape-town";

/** Second editorial guide per service page — topical depth beyond the pricing article. */
export function getSecondaryEditorialBlogLink(serviceSlug: CapeTownSeoServiceSlug): SeoInternalLink {
  const k = `${serviceSlug}|secondary-editorial`;
  switch (serviceSlug) {
    case "move-out-cleaning-cape-town": {
      const anchors = [
        "Move-out cleaning checklist for Cape Town renters",
        "Handover-ready move-out cleaning guide",
        "Renter move-out cleaning checklist",
      ];
      return { href: BLOG_MOVE_OUT_CHECKLIST, anchor: anchors[stableHash(k) % anchors.length]! };
    }
    case "airbnb-cleaning-cape-town": {
      const anchors = [
        "Best Airbnb cleaning tips in Cape Town",
        "Airbnb turnover playbook for Cape Town hosts",
        "Airbnb cleaning standards hosts actually use",
      ];
      return { href: BLOG_AIRBNB_HOST_TIPS, anchor: anchors[stableHash(k) % anchors.length]! };
    }
    default: {
      const anchors = [
        "Deep cleaning vs standard cleaning in Cape Town",
        "Choosing deep vs standard cleaning",
        "When deep cleaning beats standard visits",
      ];
      return { href: BLOG_DEEP_VS_STANDARD, anchor: anchors[stableHash(k) % anchors.length]! };
    }
  }
}

/** Visible footer strip — replaces reliance on screen-reader-only crawl lists. */
export function getPopularCapeTownFooterStripLinks(): { href: string; label: string }[] {
  return [
    { href: CAPE_TOWN_SERVICE_SEO["standard-cleaning-cape-town"].path, label: "Standard cleaning" },
    { href: CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path, label: "Deep cleaning" },
    { href: CAPE_TOWN_SERVICE_SEO["move-out-cleaning-cape-town"].path, label: "Move-out cleaning" },
    { href: LOCATION_SEO_PAGES["sea-point-cleaning-services"].path, label: "Sea Point cleaning" },
    { href: LOCATION_SEO_PAGES["claremont-cleaning-services"].path, label: "Claremont cleaning" },
  ];
}

export type ServiceHubPartition = {
  /** Priority hubs (Sea Point, Claremont, Green Point, Gardens). */
  featured: { href: string; label: string }[];
  /** Remaining hubs for broader crawl depth (deduped). */
  other: { href: string; label: string }[];
};

/** Split service-page suburb pills into featured authority hubs vs the long tail. */
export function partitionServiceHubLocationLinks(serviceSlug: CapeTownSeoServiceSlug): ServiceHubPartition {
  const all = serviceHubLocationLinks(serviceSlug);
  const featured: { href: string; label: string }[] = [];
  for (const hubSlug of PRIORITY_CAPE_TOWN_HUB_SLUGS) {
    const path = LOCATION_SEO_PAGES[hubSlug]?.path;
    if (!path) continue;
    const hit = all.find((x) => x.href === path);
    if (hit) featured.push(hit);
  }
  const featuredHrefs = new Set(featured.map((x) => x.href));
  const other = all.filter((x) => !featuredHrefs.has(x.href));
  return { featured, other };
}

/**
 * Inline sentence links under service “Areas we serve” — avoids repeating featured hubs.
 */
export function servicePageExtraLocationSentenceLinks(excludeHrefs: ReadonlySet<string>): { href: string; label: string }[] {
  return capeTownSeoLocationLinks().filter((l) => !excludeHrefs.has(l.href)).slice(0, 6);
}
