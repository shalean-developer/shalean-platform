const FALLBACK_SITE_ORIGIN = "https://shalean.co.za";

/**
 * Safe origin for `new URL()` (root `metadataBase`), OG URLs, and JSON-LD.
 * `NEXT_PUBLIC_SITE_URL` must not crash the app: bare hostnames, typos, or missing schemes
 * would throw in `app/layout.tsx` and surface as 500 on every route.
 */
function readPublicSiteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return FALLBACK_SITE_ORIGIN;

  let candidate = raw.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate.replace(/^\/+/, "")}`;
  }

  try {
    const url = new URL(candidate);
    if (!url.hostname) return FALLBACK_SITE_ORIGIN;
    // Apex is canonical in production; mis-set env (www) must not leak into metadataBase / JSON-LD.
    if (url.hostname.toLowerCase() === "www.shalean.co.za") {
      url.hostname = "shalean.co.za";
    }
    return url.origin;
  } catch {
    return FALLBACK_SITE_ORIGIN;
  }
}

/** Public site origin (scheme + host [+ port]); no trailing slash, no path. */
export const SITE_ORIGIN = readPublicSiteOrigin();

const FALLBACK_ORIGIN_URL = new URL(FALLBACK_SITE_ORIGIN);

/** Root `metadataBase` — never throws (layout metadata must survive bad env in edge runtimes). */
export function metadataBaseUrl(): URL {
  try {
    return new URL(SITE_ORIGIN);
  } catch {
    return FALLBACK_ORIGIN_URL;
  }
}

/** Normalize internal paths to absolute canonical URLs (no trailing slash normalization — match route paths). */
export function absoluteCanonicalUrl(pathname: string): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${SITE_ORIGIN}${path}`;
}
