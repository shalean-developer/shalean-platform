/**
 * SEO rebuild phase — increment when re-enabling programmatic URL classes.
 * Phase 1: minimal sitemap + 410 location hubs and window cleaning.
 * Phase 2: location suburb hubs + window cleaning service live again.
 */
export const SEO_REBUILD_PHASE = 2 as const;

/**
 * Phase-1 SEO rebuild: minimal sitemap + 410 for retired programmatic location/growth URLs.
 * Live marketing service paths use existing `-cape-town` slugs (booking flow unchanged).
 */
export const SEO_REBUILD_SITEMAP_CORE_PATHS = [
  "/",
  "/services",
  "/services/standard-cleaning-cape-town",
  "/services/deep-cleaning-cape-town",
  "/services/airbnb-cleaning-cape-town",
  "/services/office-cleaning-cape-town",
  "/services/move-out-cleaning-cape-town",
  "/services/carpet-cleaning-cape-town",
  "/services/window-cleaning-cape-town",
  "/contact",
  "/about",
] as const;

/** Phase-2 content pages — indexable marketing/editorial URLs. */
export const SEO_REBUILD_SITEMAP_CONTENT_PATHS = [
  "/blog",
  "/faq",
  "/reviews",
  "/quote",
  "/privacy-policy",
  "/terms-of-service",
] as const;

/** Phase-2 — location index + suburb hubs (see `collectLocationHubSitemapPaths`). */
export const SEO_REBUILD_SITEMAP_LOCATIONS_INDEX = "/locations" as const;

/** When true, components must not emit `/locations/*` or stage-19 internal links. */
export const SEO_REBUILD_SUPPRESS_LOCATION_HUB_LINKS = SEO_REBUILD_PHASE < 2;

function normalizePathname(pathname: string): string {
  const t = pathname.trim();
  if (!t || t === "/") return "/";
  return t.replace(/\/+$/, "") || "/";
}

/**
 * Paths that remain HTTP 410 after redirect resolvers run (no relevant live replacement).
 * Public legacy URLs that permanently redirect must NOT be listed here.
 */
function isPermanentlyRetiredSeoPath(p: string): boolean {
  if (p === "/growth/local") return true;
  if (p === "/location") return true;

  if (p.startsWith("/johannesburg/")) return true;

  if (/^\/services\/airbnb-cleaning-(sea-point|green-point|claremont)$/.test(p)) return true;

  return false;
}

/** 410 during phase 1 only — restored when {@link SEO_REBUILD_PHASE} >= 2. */
function isPhase1OnlyRetiredSeoPath(p: string): boolean {
  if (p === "/locations" || p.startsWith("/locations/")) return true;
  if (p === "/services/window-cleaning-cape-town") return true;
  return false;
}

/** Permanently removed programmatic SEO URLs — return HTTP 410 (not homepage redirects). */
export function isSeoRebuildGonePath(pathname: string): boolean {
  const p = normalizePathname(pathname);
  if (isPermanentlyRetiredSeoPath(p)) return true;
  if (SEO_REBUILD_PHASE < 2 && isPhase1OnlyRetiredSeoPath(p)) return true;
  return false;
}

export function isSeoRebuildCoreSitemapPath(pathname: string): boolean {
  const p = normalizePathname(pathname);
  return (SEO_REBUILD_SITEMAP_CORE_PATHS as readonly string[]).includes(p);
}

/**
 * Public recruitment landing that is intentionally indexable under an otherwise
 * Disallow'd `/cleaner/` tree. Also listed in the marketing sitemap.
 */
export const SEO_CLEANER_APPLY_LANDING_SITEMAP_PATH = "/cleaner/apply" as const;

/**
 * Private / operational robots.txt disallow prefixes.
 * Public legacy URLs that permanently redirect must remain crawlable (no Disallow).
 *
 * `/cleaner/` blocks the cleaner workspace tree. A separate Allow rule
 * (`/cleaner/apply$`) carves out only the recruitment landing — not `/cleaner/apply/form`
 * or other `/cleaner/*` routes. robots.txt is not access control.
 */
export function seoRobotsDisallowPaths(): string[] {
  const shared = [
    "/admin",
    "/office",
    "/api",
    "/cleaner/",
    "/payment",
    "/pay",
    "/offer",
    "/dashboard",
    "/account",
    "/auth",
    "/track",
    "/lp",
    "/login",
    "/account/success",
    "/booking/success",
    "/payment/success",
  ];
  if (SEO_REBUILD_PHASE < 2) {
    return [...shared, "/locations/"];
  }
  return shared;
}

/**
 * Production robots.txt Allow rules.
 * Keep `/cleaner/apply$` end-anchored so `/cleaner/apply/form` stays Disallow'd.
 */
export function seoRobotsAllowPaths(): string[] {
  return ["/", "/cleaner/apply$"];
}

/** Public legacy prefixes that must never be Disallow'd while they redirect or 410 for deindexation. */
export const PUBLIC_LEGACY_REDIRECT_ROBOTS_PATHS = [
  "/growth/local/",
  "/location/",
  "/deep-cleaning/",
  "/move-out-cleaning/",
  "/airbnb-cleaning/",
  "/same-day-cleaning/",
  "/office-cleaning/",
  "/cleaning-services/",
  "/cleaning-services-cape-town",
  "/cleaning-prices-cape-town",
  "/maid-services-cape-town",
  "/johannesburg/",
  "/cape-town/cleaning-services/",
] as const;
