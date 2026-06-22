import { AIRBNB_HOST_GUIDE_POSTS } from "@/lib/blog/airbnbHostGuidePosts";
import { getAllHighConversionBlogPosts } from "@/lib/blog/highConversionPosts";
import { ROUTED_PROGRAMMATIC_POSTS } from "@/lib/blog/programmaticPosts";
import { getCanonicalBlogSlug } from "@/lib/blog/validBlogRoutes";

/** Baseline when no content-specific timestamp exists (ISO date string in env overrides). */
const DEFAULT_STATIC_LAST_MODIFIED = new Date("2026-04-01T00:00:00.000Z");

function parseEnvDate(value: string | undefined): Date | null {
  const raw = value?.trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) return null;
  return new Date(ms);
}

/** Marketing hubs, services, and legal pages — bump `MARKETING_SITEMAP_LAST_MODIFIED` after substantive edits. */
export function readMarketingSitemapLastModified(): Date {
  return (
    parseEnvDate(process.env.MARKETING_SITEMAP_LAST_MODIFIED) ??
    parseEnvDate(process.env.LOCATION_HUB_LAST_CONTENT_REFRESH) ??
    DEFAULT_STATIC_LAST_MODIFIED
  );
}

/** Location suburb hubs — prefers `LOCATION_HUB_LAST_CONTENT_REFRESH`. */
export function readLocationHubSitemapLastModified(): Date {
  return parseEnvDate(process.env.LOCATION_HUB_LAST_CONTENT_REFRESH) ?? readMarketingSitemapLastModified();
}

function isoToDate(iso: string | undefined): Date | null {
  if (!iso?.trim()) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms);
}

/** Resolve last-modified for programmatic / file-based blog slugs not in the CMS. */
export function resolveProgrammaticBlogLastModified(canonicalSlug: string): Date | null {
  const slug = getCanonicalBlogSlug(canonicalSlug);

  for (const post of ROUTED_PROGRAMMATIC_POSTS) {
    if (getCanonicalBlogSlug(post.slug) === slug) {
      return isoToDate(post.dateModified ?? post.publishedAt);
    }
  }
  for (const post of getAllHighConversionBlogPosts()) {
    if (getCanonicalBlogSlug(post.slug) === slug) {
      return isoToDate(post.dateModified ?? post.publishedAt);
    }
  }
  for (const post of AIRBNB_HOST_GUIDE_POSTS) {
    if (getCanonicalBlogSlug(post.slug) === slug) {
      return isoToDate(post.dateModified ?? post.publishedAt);
    }
  }
  return null;
}
