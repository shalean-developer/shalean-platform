/**
 * Crawl/index strategy: keep Google focused on money pages, locations, and articles —
 * not thin taxonomy shells or future postcode shells.
 */

/** Normalise pathname (no trailing slash except root). */
export function normalizePathnameForIndexRules(pathname: string): string {
  const t = pathname.trim();
  if (!t || t === "/") return "/";
  return t.replace(/\/+$/, "") || "/";
}

/**
 * Paths that should send `noindex, follow` (consolidate signals on posts + hubs).
 * Extend when adding `/postcodes/*` or similar programmatic shells.
 */
export function isNonIndexableMarketingPath(pathname: string): boolean {
  const p = normalizePathnameForIndexRules(pathname);
  if (p.startsWith("/postcodes")) return true;
  if (p.startsWith("/blog/tag/")) return true;
  if (p.startsWith("/blog/category/")) return true;
  return false;
}
