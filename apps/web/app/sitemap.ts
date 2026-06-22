import type { MetadataRoute } from "next";
import { AIRBNB_HOST_GUIDE_POSTS } from "@/lib/blog/airbnbHostGuidePosts";
import { getPublishedBlogSitemapRows } from "@/lib/blog/get-post-by-slug";
import { getAllHighConversionBlogPosts } from "@/lib/blog/highConversionPosts";
import { ROUTED_PROGRAMMATIC_POSTS } from "@/lib/blog/programmaticPosts";
import {
  getCanonicalBlogSlug,
  isRedirectAliasBlogSlug,
} from "@/lib/blog/validBlogRoutes";
import { COMMERCIAL_BLOG_INDEX_PRIORITY_SLUGS } from "@/lib/blog/blog-index-hub";
import { shouldExcludeBlogSlugFromSitemap } from "@/lib/seo/programmaticBlogCleanupRedirects";
import { AIRBNB_AREA_LANDING_PATHS } from "@/lib/seo/airbnbAreaLandingPages";
import { CAPE_TOWN_SERVICE_SEO, LOCATION_SEO_PAGES, getLocationSeo } from "@/lib/seo/capeTownSeoPages";
import { SEO_STAGE19_REGISTRY } from "@/lib/seo/seoPageRegistry";
import {
  readLocationHubSitemapLastModified,
  readMarketingSitemapLastModified,
  resolveProgrammaticBlogLastModified,
} from "@/lib/seo/sitemapLastModified";
import { SITE_ORIGIN } from "@/lib/site/canonical";

/** Hubs with strong commercial FAQ + homepage “popular areas” visibility — tier bump when `tier` is unset. */
const EXTRA_HIGH_SITEMAP_LOCATION_SLUGS = new Set<string>([
  "bellville-cleaning-services",
  "durbanville-cleaning-services",
]);

function locationHubSitemapPriority(locSlug: string): number {
  const block = getLocationSeo(locSlug);
  if (!block) return 0.78;
  if (block.tier === "high" || EXTRA_HIGH_SITEMAP_LOCATION_SLUGS.has(locSlug)) return 0.84;
  return 0.78;
}

/** Never list transactional Paystack return URLs (including query variants if ever added). */
const SITEMAP_EXCLUDED_PATHNAMES = new Set(["/account/success", "/booking/success", "/payment/success"]);

function pathnameNotExcluded(url: string): boolean {
  try {
    const p = new URL(url).pathname.replace(/\/+$/, "") || "/";
    return !SITEMAP_EXCLUDED_PATHNAMES.has(p);
  } catch {
    return true;
  }
}

function normalizeSitemapUrl(url: string): string {
  try {
    const u = new URL(url);
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    return u.href;
  } catch {
    return url;
  }
}

/**
 * Public index URLs with priorities. De-duplicates by normalized URL (e.g. trailing slashes).
 *
 * **Excluded by design** (canonical elsewhere or `noindex`):
 * - `/blog/tag/*`, `/blog/category/*` — taxonomy shells (`noindex,follow`); not listed.
 * - Any `/blog/{slug}` that 301s (see `shouldExcludeBlogSlugFromSitemap` + `programmaticBlogCleanupRedirects`).
 * - Paystack return paths (`SITEMAP_EXCLUDED_PATHNAMES`).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const marketingLastModified = readMarketingSitemapLastModified();
  const locationHubLastModified = readLocationHubSitemapLastModified();
  const dbBlogRows = await getPublishedBlogSitemapRows();
  const dbBlogDates = new Map(dbBlogRows.map((r) => [getCanonicalBlogSlug(r.slug), r.lastModified]));

  const seen = new Set<string>();
  const entries: MetadataRoute.Sitemap = [];

  const push = (url: string, priority: number, lastModified: Date) => {
    if (!pathnameNotExcluded(url)) return;
    const normalized = normalizeSitemapUrl(url);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    entries.push({ url: normalized, lastModified, priority });
  };

  push(SITE_ORIGIN, 1, marketingLastModified);

  push(`${SITE_ORIGIN}/cleaning-services-cape-town`, 0.9, marketingLastModified);
  push(`${SITE_ORIGIN}/cleaning-prices-cape-town`, 0.88, marketingLastModified);

  push(`${SITE_ORIGIN}/services`, 0.9, marketingLastModified);
  for (const p of Object.values(CAPE_TOWN_SERVICE_SEO)) {
    push(`${SITE_ORIGIN}${p.path}`, 0.9, marketingLastModified);
  }

  push(`${SITE_ORIGIN}/locations`, 0.85, locationHubLastModified);
  for (const p of Object.values(LOCATION_SEO_PAGES)) {
    push(`${SITE_ORIGIN}${p.path}`, locationHubSitemapPriority(p.slug), locationHubLastModified);
  }

  for (const path of AIRBNB_AREA_LANDING_PATHS) {
    push(`${SITE_ORIGIN}${path}`, 0.8, marketingLastModified);
  }

  push(`${SITE_ORIGIN}/maid-services-cape-town`, 0.8, marketingLastModified);

  push(`${SITE_ORIGIN}/about`, 0.65, marketingLastModified);
  push(`${SITE_ORIGIN}/faq`, 0.65, marketingLastModified);
  push(`${SITE_ORIGIN}/reviews`, 0.65, marketingLastModified);
  push(`${SITE_ORIGIN}/contact`, 0.65, marketingLastModified);
  push(`${SITE_ORIGIN}/quote`, 0.72, marketingLastModified);
  push(`${SITE_ORIGIN}/privacy-policy`, 0.5, marketingLastModified);
  push(`${SITE_ORIGIN}/terms-of-service`, 0.5, marketingLastModified);

  for (const row of SEO_STAGE19_REGISTRY) {
    push(`${SITE_ORIGIN}${row.canonicalPath}`, 0.82, marketingLastModified);
  }

  push(`${SITE_ORIGIN}/blog`, 0.75, marketingLastModified);

  const blogSlugSet = new Set<string>();
  for (const row of dbBlogRows) {
    const slug = getCanonicalBlogSlug(row.slug);
    if (isRedirectAliasBlogSlug(slug)) continue;
    blogSlugSet.add(slug);
  }
  for (const post of ROUTED_PROGRAMMATIC_POSTS) blogSlugSet.add(getCanonicalBlogSlug(post.slug));
  for (const post of getAllHighConversionBlogPosts()) blogSlugSet.add(getCanonicalBlogSlug(post.slug));
  for (const post of AIRBNB_HOST_GUIDE_POSTS) blogSlugSet.add(getCanonicalBlogSlug(post.slug));

  const commercialBlogSlugHints = new Set<string>();
  for (const s of COMMERCIAL_BLOG_INDEX_PRIORITY_SLUGS) {
    commercialBlogSlugHints.add(getCanonicalBlogSlug(s));
  }
  for (const post of getAllHighConversionBlogPosts()) {
    commercialBlogSlugHints.add(getCanonicalBlogSlug(post.slug));
  }

  for (const slug of blogSlugSet) {
    if (shouldExcludeBlogSlugFromSitemap(slug)) continue;
    if (isRedirectAliasBlogSlug(slug)) continue;
    const blogPriority = commercialBlogSlugHints.has(slug) ? 0.72 : 0.68;
    const lastModified =
      dbBlogDates.get(slug) ?? resolveProgrammaticBlogLastModified(slug) ?? marketingLastModified;
    push(`${SITE_ORIGIN}/blog/${slug}`, blogPriority, lastModified);
  }

  return entries;
}
