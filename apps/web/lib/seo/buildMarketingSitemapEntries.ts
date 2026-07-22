import type { MetadataRoute } from "next";
import { collectUnionBlogSitemapRows } from "@/lib/seo/blogSitemapUnion";
import { LOCATION_SEO_PAGES, type LocationSeoSlug } from "@/lib/seo/capeTownSeoPages";
import { legacyMarketingRedirectSourcePaths } from "@/lib/seo/legacyMarketingRedirectMatrix";
import {
  SEO_CLEANER_APPLY_LANDING_SITEMAP_PATH,
  SEO_REBUILD_PHASE,
  SEO_REBUILD_SITEMAP_CONTENT_PATHS,
  SEO_REBUILD_SITEMAP_CORE_PATHS,
  SEO_REBUILD_SITEMAP_LOCATIONS_INDEX,
  isSeoRebuildGonePath,
} from "@/lib/seo/seoRebuildPhase1";
import {
  readLocationHubSitemapLastModified,
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
  if (path === SEO_CLEANER_APPLY_LANDING_SITEMAP_PATH) return 0.64;
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

const REDIRECT_SOURCE_SET = new Set(legacyMarketingRedirectSourcePaths());

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

  // Narrow public recruitment exception — form and other /cleaner/* stay off sitemap.
  push(SEO_CLEANER_APPLY_LANDING_SITEMAP_PATH, resolveStaticPathLastModified(SEO_CLEANER_APPLY_LANDING_SITEMAP_PATH));

  for (const path of collectLocationHubSitemapPaths()) {
    push(path, locationLastModified);
  }

  const blogRows = await collectUnionBlogSitemapRows();
  for (const row of blogRows) {
    push(`/blog/${row.slug}`, row.lastModified);
  }

  return entries;
}
