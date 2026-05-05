const FALLBACK_SITE_ORIGIN = "https://shalean.co.za";

function normalizeSiteUrlInput(raw: string): string {
  let candidate = raw.trim().replace(/\/+$/, "");
  if (!candidate) return "";
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate.replace(/^\/+/, "")}`;
  }
  return candidate;
}

/**
 * Safe origin for `new URL()` (root `metadataBase`), OG URLs, and JSON-LD.
 * `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL` must not crash the app: bare hostnames, typos,
 * `javascript:` URLs, or missing schemes would throw during layout metadata resolution → 500 on every route.
 */
function readPublicSiteOrigin(): string {
  const raw =
    normalizeSiteUrlInput(process.env.NEXT_PUBLIC_SITE_URL ?? "") ||
    normalizeSiteUrlInput(process.env.NEXT_PUBLIC_APP_URL ?? "");
  if (!raw) return FALLBACK_SITE_ORIGIN;

  try {
    const url = new URL(raw);
    if (!url.hostname) return FALLBACK_SITE_ORIGIN;
    const proto = url.protocol.toLowerCase();
    if (proto !== "http:" && proto !== "https:") {
      return FALLBACK_SITE_ORIGIN;
    }
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

/**
 * Root layout `metadata.metadataBase` — must never throw (bad/missing env on Vercel must not 500 the site).
 * Prefer importing this over `new URL(process.env.…)` in metadata exports.
 */
export function metadataBaseUrl(): URL {
  try {
    const u = new URL(SITE_ORIGIN);
    const p = u.protocol.toLowerCase();
    if (p !== "http:" && p !== "https:") return FALLBACK_ORIGIN_URL;
    return u;
  } catch {
    return FALLBACK_ORIGIN_URL;
  }
}

/** Normalize internal paths to absolute canonical URLs (no trailing slash normalization — match route paths). */
export function absoluteCanonicalUrl(pathname: string): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${SITE_ORIGIN}${path}`;
}
