import type { MetadataRoute } from "next";
import { getPublishedBlogSlugs } from "@/lib/blog/get-post-by-slug";
import { listActiveCategorySlugs, listTagSlugs } from "@/lib/blog/get-taxonomy-posts";
import { ROUTED_PROGRAMMATIC_POSTS } from "@/lib/blog/programmaticPosts";
import { CAPE_TOWN_SERVICE_SEO, LOCATION_SEO_PAGES } from "@/lib/seo/capeTownSeoPages";

const BASE = "https://www.shalean.co.za";

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

/**
 * Public index URLs: `/`, `/services`, `/services/*`, `/locations/*`, `/blog/*`, Supabase blog posts, taxonomy.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();

  const dbSlugs = await getPublishedBlogSlugs();
  const categorySlugs = await listActiveCategorySlugs();
  const tagSlugs = await listTagSlugs();

  const blogPostUrls: MetadataRoute.Sitemap = [];

  const blogSlugSet = new Set<string>();
  for (const s of dbSlugs) blogSlugSet.add(s);
  for (const post of ROUTED_PROGRAMMATIC_POSTS) blogSlugSet.add(post.slug);

  for (const slug of blogSlugSet) {
    blogPostUrls.push({ url: `${BASE}/blog/${slug}`, lastModified });
  }

  const entries: MetadataRoute.Sitemap = [
    { url: BASE, lastModified },
    { url: `${BASE}/services`, lastModified },
    { url: `${BASE}/locations`, lastModified },
    { url: `${BASE}/reviews`, lastModified },
    { url: `${BASE}/locations/cape-town-cleaning-services`, lastModified },
    { url: `${BASE}/blog`, lastModified },
    ...blogPostUrls,
    ...categorySlugs.map((slug) => ({
      url: `${BASE}/blog/category/${slug}`,
      lastModified,
    })),
    ...tagSlugs.map((slug) => ({
      url: `${BASE}/blog/tag/${slug}`,
      lastModified,
    })),
    ...Object.values(CAPE_TOWN_SERVICE_SEO).map((p) => ({
      url: `${BASE}${p.path}`,
      lastModified,
    })),
    ...Object.values(LOCATION_SEO_PAGES).map((p) => ({
      url: `${BASE}${p.path}`,
      lastModified,
    })),
  ];

  return entries.filter((e) => pathnameNotExcluded(e.url));
}
