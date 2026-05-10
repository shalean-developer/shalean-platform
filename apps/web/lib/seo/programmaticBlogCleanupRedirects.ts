/**
 * Legacy programmatic `/blog/*` URLs → canonical commercial or editorial destinations (single hop).
 *
 * - Service×area thin URLs → `/locations/{area}-cleaning-services` (not `/blog/cleaning-services-*`).
 * - Thin “best cleaning services in {area}” clones → `/locations/{area}-cleaning-services` via `proxy.ts`.
 * - Hub seed slugs in `LOCATION_HUB_STRUCTURED_PAGES` may still exist for CMS import; HTTP requests to retired
 *   commercial editorial URLs redirect to suburb hubs below.
 */
import { CAPE_TOWN_LOCATIONS, HUB_SUFFIX } from "./capeTownLocations";

/** One-hop `/blog/cleaning-services-{area}-cape-town` → `/locations/{area}-cleaning-services` per catalogue row. */
function commercialCleaningServicesBlogToLocationRedirects(): {
  source: string;
  destination: string;
  permanent: true;
}[] {
  return CAPE_TOWN_LOCATIONS.map((row) => {
    const areaKebab = row.slug.endsWith(HUB_SUFFIX)
      ? row.slug.slice(0, -HUB_SUFFIX.length)
      : row.slug;
    return {
      source: `/blog/cleaning-services-${areaKebab}-cape-town`,
      destination: `/locations/${row.slug}`,
      permanent: true as const,
    };
  });
}

const coreProgrammaticBlogCleanupRedirects = [
  /** Retired draft-only slug → live pricing authority (no cluster bleed into unrelated blog topics). */
  {
    source: "/blog/cleaning-prices-cape-town-guide",
    destination: "/cleaning-prices-cape-town",
    permanent: true,
  },
  {
    source: "/blog/move-out-cleaning-checklist-cape-town-renters",
    destination: "/blog/move-out-cleaning-checklist-cape-town",
    permanent: true,
  },
  {
    source: "/blog/airbnb-cleaning-vs-regular-home-cleaning-cape-town",
    destination: "/blog/airbnb-cleaning-checklist-cape-town",
    permanent: true,
  },
  /** Legacy slug string used across TSX — router serves HC article under this pathname instead. */
  {
    source: "/blog/deep-vs-standard-cleaning-cape-town",
    destination: "/blog/deep-cleaning-vs-regular-cleaning-cape-town",
    permanent: true,
  },
  /** Renamed pricing article slug (seed) → in-repo HC slug. */
  {
    source: "/blog/how-much-does-cleaning-cost-cape-town",
    destination: "/blog/how-much-does-cleaning-cost-cape-town-2026",
    permanent: true,
  },
  /** Legacy short slugs → canonical live posts. */
  {
    source: "/blog/airbnb-cleaning-checklist",
    destination: "/blog/airbnb-cleaning-checklist-cape-town",
    permanent: true,
  },
  {
    source: "/blog/move-out-cleaning-guide",
    destination: "/blog/move-out-cleaning-checklist-cape-town",
    permanent: true,
  },
  /** Generic checklist URLs (no suburb) — never shipped as posts; send to commercial intent pages. */
  {
    source: "/blog/deep-cleaning-checklist-cape-town",
    destination: "/services/deep-cleaning-cape-town",
    permanent: true,
  },
  {
    source: "/blog/standard-cleaning-checklist-cape-town",
    destination: "/services/standard-cleaning-cape-town",
    permanent: true,
  },
  /** Legacy editorial slug — not in TS router unless published in CMS; pricing hub is always live. */
  {
    source: "/blog/cleaning-cost-cape-town",
    destination: "/cleaning-prices-cape-town",
    permanent: true,
  },

  /** Retired commercial-intent area blogs → suburb hubs (canonical local money pages). */
  {
    source: "/blog/deep-cleaning-gardens-cape-town",
    destination: "/locations/gardens-cleaning-services",
    permanent: true,
  },
  {
    source: "/blog/luxury-home-cleaning-camps-bay-cape-town",
    destination: "/locations/camps-bay-cleaning-services",
    permanent: true,
  },
  {
    source: "/blog/regular-home-cleaning-wynberg-cape-town",
    destination: "/locations/wynberg-cleaning-services",
    permanent: true,
  },
  {
    source: "/blog/affordable-cleaning-observatory-cape-town",
    destination: "/locations/observatory-cleaning-services",
    permanent: true,
  },
  {
    source: "/blog/home-cleaning-plumstead-cape-town",
    destination: "/locations/plumstead-cleaning-services",
    permanent: true,
  },
  {
    source: "/blog/home-cleaning-constantia-cape-town",
    destination: "/locations/constantia-cleaning-services",
    permanent: true,
  },
  {
    source: "/blog/move-out-cleaning-rondebosch-cape-town",
    destination: "/locations/rondebosch-cleaning-services",
    permanent: true,
  },

  {
    source: "/blog/deep-cleaning-claremont-cape-town",
    destination: "/locations/claremont-cleaning-services",
    permanent: true,
  },
  {
    source: "/blog/airbnb-cleaning-claremont-cape-town",
    destination: "/locations/claremont-cleaning-services",
    permanent: true,
  },
  {
    source: "/blog/move-out-cleaning-claremont-cape-town",
    destination: "/locations/claremont-cleaning-services",
    permanent: true,
  },
  {
    source: "/blog/standard-cleaning-claremont-cape-town",
    destination: "/locations/claremont-cleaning-services",
    permanent: true,
  },
  {
    source: "/blog/carpet-cleaning-claremont-cape-town",
    destination: "/locations/claremont-cleaning-services",
    permanent: true,
  },

  {
    source: "/blog/deep-cleaning-sea-point-cape-town",
    destination: "/locations/sea-point-cleaning-services",
    permanent: true,
  },
  {
    source: "/blog/airbnb-cleaning-sea-point-cape-town",
    destination: "/locations/sea-point-cleaning-services",
    permanent: true,
  },
  {
    source: "/blog/move-out-cleaning-sea-point-cape-town",
    destination: "/locations/sea-point-cleaning-services",
    permanent: true,
  },
  {
    source: "/blog/standard-cleaning-sea-point-cape-town",
    destination: "/locations/sea-point-cleaning-services",
    permanent: true,
  },
  {
    source: "/blog/carpet-cleaning-sea-point-cape-town",
    destination: "/locations/sea-point-cleaning-services",
    permanent: true,
  },

  {
    source: "/blog/deep-cleaning-rondebosch-cape-town",
    destination: "/locations/rondebosch-cleaning-services",
    permanent: true,
  },
  {
    source: "/blog/airbnb-cleaning-rondebosch-cape-town",
    destination: "/locations/rondebosch-cleaning-services",
    permanent: true,
  },
  {
    source: "/blog/standard-cleaning-rondebosch-cape-town",
    destination: "/locations/rondebosch-cleaning-services",
    permanent: true,
  },
  {
    source: "/blog/carpet-cleaning-rondebosch-cape-town",
    destination: "/locations/rondebosch-cleaning-services",
    permanent: true,
  },

  {
    source: "/blog/airbnb-cleaning-gardens-cape-town",
    destination: "/locations/gardens-cleaning-services",
    permanent: true,
  },
  {
    source: "/blog/move-out-cleaning-gardens-cape-town",
    destination: "/locations/gardens-cleaning-services",
    permanent: true,
  },
  {
    source: "/blog/standard-cleaning-gardens-cape-town",
    destination: "/locations/gardens-cleaning-services",
    permanent: true,
  },
  {
    source: "/blog/carpet-cleaning-gardens-cape-town",
    destination: "/locations/gardens-cleaning-services",
    permanent: true,
  },

  {
    source: "/blog/deep-cleaning-wynberg-cape-town",
    destination: "/locations/wynberg-cleaning-services",
    permanent: true,
  },
  {
    source: "/blog/airbnb-cleaning-wynberg-cape-town",
    destination: "/locations/wynberg-cleaning-services",
    permanent: true,
  },
  {
    source: "/blog/move-out-cleaning-wynberg-cape-town",
    destination: "/locations/wynberg-cleaning-services",
    permanent: true,
  },
  {
    source: "/blog/standard-cleaning-wynberg-cape-town",
    destination: "/locations/wynberg-cleaning-services",
    permanent: true,
  },
  {
    source: "/blog/carpet-cleaning-wynberg-cape-town",
    destination: "/locations/wynberg-cleaning-services",
    permanent: true,
  },

  {
    source: "/blog/deep-cleaning-green-point-cape-town",
    destination: "/locations/green-point-cleaning-services",
    permanent: true,
  },
  {
    source: "/blog/airbnb-cleaning-green-point-cape-town",
    destination: "/locations/green-point-cleaning-services",
    permanent: true,
  },
  {
    source: "/blog/move-out-cleaning-green-point-cape-town",
    destination: "/locations/green-point-cleaning-services",
    permanent: true,
  },

  {
    source: "/blog/deep-cleaning-durbanville-cape-town",
    destination: "/locations/durbanville-cleaning-services",
    permanent: true,
  },
  {
    source: "/blog/airbnb-cleaning-durbanville-cape-town",
    destination: "/locations/durbanville-cleaning-services",
    permanent: true,
  },
  {
    source: "/blog/move-out-cleaning-durbanville-cape-town",
    destination: "/locations/durbanville-cleaning-services",
    permanent: true,
  },
] as const;

export const programmaticBlogCleanupRedirects = [
  ...coreProgrammaticBlogCleanupRedirects,
  ...commercialCleaningServicesBlogToLocationRedirects(),
];

function blogSlugFromRedirectSource(source: string): string | null {
  const path = source.replace(/\/+$/, "");
  if (!path.startsWith("/blog/")) return null;
  const slug = path.slice("/blog/".length);
  return slug.length > 0 ? slug : null;
}

/**
 * Slugs that respond with a redirect to another URL — omit from `sitemap.ts` (final/canonical URLs only).
 * Derived from {@link programmaticBlogCleanupRedirects} sources under `/blog/*`.
 */
export const BLOG_SLUGS_EXCLUDED_FROM_SITEMAP = new Set<string>(
  programmaticBlogCleanupRedirects.map((r) => blogSlugFromRedirectSource(r.source)).filter((s): s is string => Boolean(s)),
);

/** Matches `proxy.ts` thin-clone pattern (handled at edge before Next redirects). */
const BEST_CLEANING_SERVICES_REDIRECT_SLUG = /^best-cleaning-services-.+-cape-town$/;

/** Legacy commercial hub blog pattern — canonical is `/locations/*` (also listed as redirect sources). */
const COMMERCIAL_CLEANING_SERVICES_BLOG_SLUG = /^cleaning-services-.+-cape-town$/;

/**
 * True when `/blog/{slug}` would redirect — do not list in sitemap.
 */
export function shouldExcludeBlogSlugFromSitemap(slug: string): boolean {
  if (BLOG_SLUGS_EXCLUDED_FROM_SITEMAP.has(slug)) return true;
  if (BEST_CLEANING_SERVICES_REDIRECT_SLUG.test(slug)) return true;
  if (COMMERCIAL_CLEANING_SERVICES_BLOG_SLUG.test(slug)) return true;
  return false;
}
