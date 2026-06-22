import { STAGE19_INTENT_SEGMENTS } from "@/lib/seo/seoPageRegistry";

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
  "/contact",
  "/about",
] as const;

/** When true, components must not emit `/locations/*` or stage-19 internal links. */
export const SEO_REBUILD_SUPPRESS_LOCATION_HUB_LINKS = true;

function normalizePathname(pathname: string): string {
  const t = pathname.trim();
  if (!t || t === "/") return "/";
  return t.replace(/\/+$/, "") || "/";
}

/** Permanently removed programmatic SEO URLs — return HTTP 410 (not homepage redirects). */
export function isSeoRebuildGonePath(pathname: string): boolean {
  const p = normalizePathname(pathname);

  if (p === "/growth/local" || p.startsWith("/growth/local/")) return true;

  if (p === "/location" || p.startsWith("/location/")) return true;

  if (p === "/locations" || p.startsWith("/locations/")) return true;

  for (const intent of STAGE19_INTENT_SEGMENTS) {
    if (p === `/${intent}` || p.startsWith(`/${intent}/`)) return true;
  }

  if (p.startsWith("/cape-town/cleaning-services/")) return true;
  if (p.startsWith("/johannesburg/")) return true;

  if (p === "/cleaning-services" || p.startsWith("/cleaning-services/")) return true;

  if (p === "/cleaning-services-cape-town") return true;
  if (p === "/cleaning-prices-cape-town") return true;
  if (p === "/maid-services-cape-town") return true;

  if (p === "/services/window-cleaning-cape-town") return true;
  if (/^\/services\/airbnb-cleaning-(sea-point|green-point|claremont)$/.test(p)) return true;

  return false;
}

export function isSeoRebuildCoreSitemapPath(pathname: string): boolean {
  const p = normalizePathname(pathname);
  return (SEO_REBUILD_SITEMAP_CORE_PATHS as readonly string[]).includes(p);
}
