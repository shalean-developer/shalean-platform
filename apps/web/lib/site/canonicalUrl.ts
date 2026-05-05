import { absoluteCanonicalUrl } from "./canonical";

export { SITE_ORIGIN } from "./canonical";

/** Absolute apex URL for a pathname — same as `absoluteCanonicalUrl`; use where explicit naming helps SEO call sites. */
export function canonicalUrl(path: string): string {
  return absoluteCanonicalUrl(path);
}
