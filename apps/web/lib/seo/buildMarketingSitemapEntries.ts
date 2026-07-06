import type { MetadataRoute } from "next";
import { getPublishedBlogSitemapRows } from "@/lib/blog/get-post-by-slug";
import { isRedirectAliasBlogSlug, resolveBlogRedirectChain } from "@/lib/blog/validBlogRoutes";
import { LOCATION_SEO_PAGES, type LocationSeoSlug } from "@/lib/seo/capeTownSeoPages";
import {
  SEO_REBUILD_PHASE,
  SEO_REBUILD_SITEMAP_CONTENT_PATHS,
  SEO_REBUILD_SITEMAP_CORE_PATHS,
  SEO_REBUILD_SITEMAP_LOCATIONS_INDEX,
  isSeoRebuildGonePath,
} from "@/lib/seo/seoRebuildPhase1";
import { readMarketingSitemapLastModified } from "@/lib/seo/sitemapLastModified";
import { SITE_ORIGIN } from "@/lib/site/canonical";

function normalizeSitemapUrl(url: string): string {
  try {
    const u = new URL(url);
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    return u.href;
  } catch {
    return url;
  }
}

function priorityForMarketingPath(path: string): number {
  if (path === "/") return 1;
  if (path === "/services") return 0.9;
  if (path.startsWith("/services/")) return 0.88;
  if (path === "/blog") return 0.75;
  if (path === "/faq" || path === "/reviews") return 0.72;
  if (path === "/quote") return 0.68;
  if (path === "/privacy-policy" || path === "/terms-of-service") return 0.55;
  if (path.startsWith("/blog/")) return 0.62;
  if (path.startsWith("/locations/")) return 0.58;
  if (path === "/locations") return 0.6;
  return 0.65;
}

function collectLocationHubSitemapPaths(): string[] {
  if (SEO_REBUILD_PHASE < 2) return [];
  const paths: string[] = [SEO_REBUILD_SITEMAP_LOCATIONS_INDEX];
  for (const slug of Object.keys(LOCATION_SEO_PAGES) as LocationSeoSlug[]) {
    const path = LOCATION_SEO_PAGES[slug]?.path;
    if (!path || isSeoRebuildGonePath(path)) continue;
    paths.push(path);
  }
  return paths;
}

function isIndexableBlogSitemapSlug(slug: string): boolean {
  const s = slug.trim().toLowerCase();
  if (!s || isRedirectAliasBlogSlug(s)) return false;
  const resolved = resolveBlogRedirectChain(`/blog/${s}`);
  return resolved.startsWith("/blog/");
}

/** Dynamic sitemap entries for indexable marketing + published blog posts. */
export async function buildMarketingSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  const marketingLastModified = readMarketingSitemapLastModified();
  const seen = new Set<string>();
  const entries: MetadataRoute.Sitemap = [];

  function push(path: string, lastModified: Date, priority?: number): void {
    const url = normalizeSitemapUrl(`${SITE_ORIGIN}${path}`);
    if (seen.has(url)) return;
    seen.add(url);
    entries.push({ url, lastModified, priority: priority ?? priorityForMarketingPath(path) });
  }

  for (const path of SEO_REBUILD_SITEMAP_CORE_PATHS) {
    push(path, marketingLastModified);
  }

  for (const path of SEO_REBUILD_SITEMAP_CONTENT_PATHS) {
    push(path, marketingLastModified);
  }

  for (const path of collectLocationHubSitemapPaths()) {
    push(path, marketingLastModified);
  }

  const blogRows = await getPublishedBlogSitemapRows();
  for (const row of blogRows) {
    if (!isIndexableBlogSitemapSlug(row.slug)) continue;
    const canonSlug = resolveBlogRedirectChain(`/blog/${row.slug}`).replace(/^\/blog\//, "");
    if (!canonSlug) continue;
    push(`/blog/${canonSlug}`, row.lastModified);
  }

  return entries;
}
