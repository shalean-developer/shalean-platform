import type { MetadataRoute } from "next";
import { AIRBNB_HOST_GUIDE_POSTS } from "@/lib/blog/airbnbHostGuidePosts";
import { getPublishedBlogSitemapRows } from "@/lib/blog/get-post-by-slug";
import { getAllHighConversionBlogPosts } from "@/lib/blog/highConversionPosts";
import { ROUTED_PROGRAMMATIC_POSTS } from "@/lib/blog/programmaticPosts";
import { isRedirectAliasBlogSlug, resolveBlogRedirectChain } from "@/lib/blog/validBlogRoutes";
import { LOCATION_SEO_PAGES, type LocationSeoSlug } from "@/lib/seo/capeTownSeoPages";
import { legacyMarketingRedirectSourcePaths } from "@/lib/seo/legacyMarketingRedirectMatrix";
import {
  SEO_REBUILD_PHASE,
  SEO_REBUILD_SITEMAP_CONTENT_PATHS,
  SEO_REBUILD_SITEMAP_CORE_PATHS,
  SEO_REBUILD_SITEMAP_LOCATIONS_INDEX,
  isSeoRebuildGonePath,
} from "@/lib/seo/seoRebuildPhase1";
import {
  readLocationHubSitemapLastModified,
  resolveProgrammaticBlogLastModified,
  resolveStaticPathLastModified,
} from "@/lib/seo/sitemapLastModified";
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

const REDIRECT_SOURCE_SET = new Set(legacyMarketingRedirectSourcePaths());

function collectFileBasedBlogSitemapRows(): { slug: string; lastModified: Date }[] {
  const bySlug = new Map<string, Date>();

  function consider(slug: string, lastModified: Date | null): void {
    if (!lastModified || !isIndexableBlogSitemapSlug(slug)) return;
    const canonSlug = resolveBlogRedirectChain(`/blog/${slug}`).replace(/^\/blog\//, "");
    if (!canonSlug || !isIndexableBlogSitemapSlug(canonSlug)) return;
    const prev = bySlug.get(canonSlug);
    if (!prev || lastModified.getTime() > prev.getTime()) {
      bySlug.set(canonSlug, lastModified);
    }
  }

  for (const post of getAllHighConversionBlogPosts()) {
    consider(post.slug, resolveProgrammaticBlogLastModified(post.slug));
  }
  for (const post of ROUTED_PROGRAMMATIC_POSTS) {
    consider(post.slug, resolveProgrammaticBlogLastModified(post.slug));
  }
  for (const post of AIRBNB_HOST_GUIDE_POSTS) {
    consider(post.slug, resolveProgrammaticBlogLastModified(post.slug));
  }

  return [...bySlug.entries()].map(([slug, lastModified]) => ({ slug, lastModified }));
}

/** Dynamic sitemap entries for indexable marketing + published blog posts. */
export async function buildMarketingSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  const locationLastModified = readLocationHubSitemapLastModified();
  const seen = new Set<string>();
  const entries: MetadataRoute.Sitemap = [];

  function push(path: string, lastModified: Date, priority?: number): void {
    const normPath = path.replace(/\/+$/, "") || "/";
    if (REDIRECT_SOURCE_SET.has(normPath)) return;
    if (isSeoRebuildGonePath(normPath)) return;
    const url = normalizeSitemapUrl(`${SITE_ORIGIN}${normPath}`);
    if (seen.has(url)) return;
    seen.add(url);
    entries.push({ url, lastModified, priority: priority ?? priorityForMarketingPath(normPath) });
  }

  for (const path of SEO_REBUILD_SITEMAP_CORE_PATHS) {
    push(path, resolveStaticPathLastModified(path));
  }

  for (const path of SEO_REBUILD_SITEMAP_CONTENT_PATHS) {
    push(path, resolveStaticPathLastModified(path));
  }

  for (const path of collectLocationHubSitemapPaths()) {
    push(path, locationLastModified);
  }

  /**
   * CMS articles first — live `/blog/[slug]` prefers Supabase, so sitemap lastmod must follow CMS
   * when both sources publish the same slug. File-based rows then fill gaps if CMS is unavailable.
   */
  try {
    const blogRows = await getPublishedBlogSitemapRows();
    for (const row of blogRows) {
      if (!isIndexableBlogSitemapSlug(row.slug)) continue;
      const canonSlug = resolveBlogRedirectChain(`/blog/${row.slug}`).replace(/^\/blog\//, "");
      if (!canonSlug) continue;
      push(`/blog/${canonSlug}`, row.lastModified);
    }
  } catch (err) {
    console.error("[sitemap] getPublishedBlogSitemapRows failed — continuing with file-based posts", err);
  }

  for (const row of collectFileBasedBlogSitemapRows()) {
    push(`/blog/${row.slug}`, row.lastModified);
  }

  return entries;
}
