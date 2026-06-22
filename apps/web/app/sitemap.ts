import type { MetadataRoute } from "next";
import { SEO_REBUILD_SITEMAP_CORE_PATHS } from "@/lib/seo/seoRebuildPhase1";
import { readMarketingSitemapLastModified } from "@/lib/seo/sitemapLastModified";
import { SITE_ORIGIN } from "@/lib/site/canonical";

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
 * Phase-1 rebuild sitemap — core commercial pages only.
 * Programmatic location/growth URLs are 410 and excluded; blog/faq/reviews re-added in later phases.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = readMarketingSitemapLastModified();
  const seen = new Set<string>();
  const entries: MetadataRoute.Sitemap = [];

  for (const path of SEO_REBUILD_SITEMAP_CORE_PATHS) {
    if (!pathnameNotExcluded(`${SITE_ORIGIN}${path}`)) continue;
    const url = normalizeSitemapUrl(`${SITE_ORIGIN}${path}`);
    if (seen.has(url)) continue;
    seen.add(url);
    const priority = path === "/" ? 1 : path === "/services" ? 0.9 : path.startsWith("/services/") ? 0.88 : 0.65;
    entries.push({ url, lastModified, priority });
  }

  return entries;
}
