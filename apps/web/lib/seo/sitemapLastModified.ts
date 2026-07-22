import { AIRBNB_HOST_GUIDE_POSTS } from "@/lib/blog/airbnbHostGuidePosts";
import { getAllHighConversionBlogPosts } from "@/lib/blog/highConversionPosts";
import { ROUTED_PROGRAMMATIC_POSTS } from "@/lib/blog/programmaticPosts";
import { getCanonicalBlogSlug } from "@/lib/blog/validBlogRoutes";
import hubsFile from "@/lib/seo/data/location-hubs.json";

function parseEnvDate(value: string | undefined): Date | null {
  const raw = value?.trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) return null;
  return new Date(ms);
}

/**
 * Content lastmod registry for static marketing paths.
 * Bump the ISO date when the corresponding page/content meaningfully changes.
 * Never use request time here.
 */
const STATIC_CONTENT_LASTMOD: Record<string, string> = {
  "/": "2026-07-15T00:00:00.000Z",
  "/services": "2026-07-15T00:00:00.000Z",
  "/services/standard-cleaning-cape-town": "2026-07-10T00:00:00.000Z",
  "/services/deep-cleaning-cape-town": "2026-07-10T00:00:00.000Z",
  "/services/airbnb-cleaning-cape-town": "2026-07-10T00:00:00.000Z",
  "/services/office-cleaning-cape-town": "2026-07-10T00:00:00.000Z",
  "/services/move-out-cleaning-cape-town": "2026-07-10T00:00:00.000Z",
  "/services/carpet-cleaning-cape-town": "2026-07-10T00:00:00.000Z",
  "/services/window-cleaning-cape-town": "2026-07-10T00:00:00.000Z",
  "/contact": "2026-06-01T00:00:00.000Z",
  "/about": "2026-06-01T00:00:00.000Z",
  "/blog": "2026-07-15T00:00:00.000Z",
  "/faq": "2026-06-01T00:00:00.000Z",
  "/reviews": "2026-06-01T00:00:00.000Z",
  "/quote": "2026-06-01T00:00:00.000Z",
  "/privacy-policy": "2026-05-01T00:00:00.000Z",
  "/terms-of-service": "2026-05-01T00:00:00.000Z",
  "/locations": "2026-07-01T00:00:00.000Z",
};

function isoToDate(iso: string | undefined): Date | null {
  if (!iso?.trim()) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms);
}

/** lastmod for a static marketing path from content registry (or env override). */
export function resolveStaticPathLastModified(pathname: string): Date {
  const env =
    parseEnvDate(process.env.MARKETING_SITEMAP_LAST_MODIFIED) ??
    parseEnvDate(process.env.LOCATION_HUB_LAST_CONTENT_REFRESH);
  const fromRegistry = isoToDate(STATIC_CONTENT_LASTMOD[pathname]);
  if (fromRegistry) return fromRegistry;
  if (env) return env;
  return isoToDate(STATIC_CONTENT_LASTMOD["/"]) ?? new Date("2026-06-01T00:00:00.000Z");
}

/** Marketing hubs, services, and legal pages — bump `MARKETING_SITEMAP_LAST_MODIFIED` after substantive edits. */
export function readMarketingSitemapLastModified(): Date {
  return (
    parseEnvDate(process.env.MARKETING_SITEMAP_LAST_MODIFIED) ??
    parseEnvDate(process.env.LOCATION_HUB_LAST_CONTENT_REFRESH) ??
    resolveStaticPathLastModified("/")
  );
}

/** Location suburb hubs — prefers env, else hubs JSON `updatedAt` / version-tied stamp. */
export function readLocationHubSitemapLastModified(): Date {
  const env = parseEnvDate(process.env.LOCATION_HUB_LAST_CONTENT_REFRESH);
  if (env) return env;
  const fromJson = isoToDate(
    typeof (hubsFile as { updatedAt?: string }).updatedAt === "string"
      ? (hubsFile as { updatedAt?: string }).updatedAt
      : undefined,
  );
  if (fromJson) return fromJson;
  return resolveStaticPathLastModified("/locations");
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
