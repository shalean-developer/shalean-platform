/** Production origin used for `<link rel="canonical">`, OG URLs, and JSON-LD `@id`s. */
export const SITE_ORIGIN = "https://www.shalean.co.za";

/** Normalize internal paths to absolute canonical URLs (no trailing slash normalization — match route paths). */
export function absoluteCanonicalUrl(pathname: string): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${SITE_ORIGIN}${path}`;
}
