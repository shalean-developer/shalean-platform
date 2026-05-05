import type { MetadataRoute } from "next";
import { getPublishedBlogSlugs } from "@/lib/blog/get-post-by-slug";
import { listActiveCategorySlugs, listTagSlugs } from "@/lib/blog/get-taxonomy-posts";
import { ROUTED_PROGRAMMATIC_POSTS } from "@/lib/blog/programmaticPosts";
import { AIRBNB_AREA_LANDING_PATHS } from "@/lib/seo/airbnbAreaLandingPages";
import { CAPE_TOWN_SERVICE_SEO, LOCATION_SEO_PAGES } from "@/lib/seo/capeTownSeoPages";
import { SITE_ORIGIN } from "@/lib/site/canonical";

/** Never list transactional Paystack return URLs (including query variants if ever added). */
const SITEMAP_EXCLUDED_PATHNAMES = new Set(["/booking/success", "/payment/success"]);

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
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();
  const seen = new Set<string>();
  const entries: MetadataRoute.Sitemap = [];

  const push = (url: string, priority: number) => {
    if (!pathnameNotExcluded(url)) return;
    const normalized = normalizeSitemapUrl(url);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    entries.push({ url: normalized, lastModified, priority });
  };

  push(SITE_ORIGIN, 1);

  push(`${SITE_ORIGIN}/services`, 0.9);
  for (const p of Object.values(CAPE_TOWN_SERVICE_SEO)) {
    push(`${SITE_ORIGIN}${p.path}`, 0.9);
  }

  push(`${SITE_ORIGIN}/locations`, 0.8);
  push(`${SITE_ORIGIN}/locations/cape-town-cleaning-services`, 0.8);
  for (const p of Object.values(LOCATION_SEO_PAGES)) {
    push(`${SITE_ORIGIN}${p.path}`, 0.8);
  }

  for (const path of AIRBNB_AREA_LANDING_PATHS) {
    push(`${SITE_ORIGIN}${path}`, 0.8);
  }

  push(`${SITE_ORIGIN}/cleaning-prices-cape-town`, 0.8);
  push(`${SITE_ORIGIN}/maid-services-cape-town`, 0.8);

  push(`${SITE_ORIGIN}/about`, 0.65);
  push(`${SITE_ORIGIN}/faq`, 0.65);
  push(`${SITE_ORIGIN}/reviews`, 0.65);

  push(`${SITE_ORIGIN}/blog`, 0.7);

  /** DB article URLs only — `getPublishedBlogSlugs` requires published, `published_at` ≤ now, non-null `content_json`. */
  const dbSlugs = await getPublishedBlogSlugs();
  const categorySlugs = await listActiveCategorySlugs();
  const tagSlugs = await listTagSlugs();

  const blogSlugSet = new Set<string>();
  for (const s of dbSlugs) blogSlugSet.add(s);
  for (const post of ROUTED_PROGRAMMATIC_POSTS) blogSlugSet.add(post.slug);

  for (const slug of blogSlugSet) {
    push(`${SITE_ORIGIN}/blog/${slug}`, 0.7);
  }

  for (const slug of categorySlugs) {
    push(`${SITE_ORIGIN}/blog/category/${slug}`, 0.65);
  }

  for (const slug of tagSlugs) {
    push(`${SITE_ORIGIN}/blog/tag/${slug}`, 0.65);
  }

  return entries;
}
