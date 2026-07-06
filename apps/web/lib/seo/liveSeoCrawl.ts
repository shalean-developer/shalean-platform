/**
 * Shared helpers for live production SEO crawlers (sitemap, internal links, GSC readiness).
 */

export const DEFAULT_AUDIT_BASE_URL = "https://shalean.co.za";

export function resolveAuditBaseUrl(raw?: string | null): string {
  return raw?.trim().replace(/\/+$/, "") || DEFAULT_AUDIT_BASE_URL;
}

export function normalizeUrlPath(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.origin}${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

/** Extract same-origin path targets from rendered HTML `<a href>`. */
export function extractSameOriginLinks(html: string, pageUrl: string): string[] {
  const base = new URL(pageUrl);
  const out = new Set<string>();
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1]?.trim();
    if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) {
      continue;
    }
    try {
      const abs = new URL(href, pageUrl);
      if (abs.origin !== base.origin) continue;
      const path = normalizeUrlPath(abs.href);
      out.add(path);
    } catch {
      continue;
    }
  }
  return [...out];
}

export function extractGoogleSiteVerificationToken(html: string): string | null {
  const head = html.slice(0, 180_000);
  const re = /<meta\b[^>]*\bname\s*=\s*["']google-site-verification["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(head)) !== null) {
    const tag = m[0];
    const c = /\bcontent\s*=\s*["']([^"']+)["']/i.exec(tag);
    const content = c?.[1]?.trim();
    if (content) return content;
  }
  return null;
}

export type LiveFetchResult = { status: number; location: string | null; body: string };

export async function fetchWithNoRedirect(url: string, timeoutMs = 25_000): Promise<LiveFetchResult> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: ac.signal,
      headers: {
        "user-agent": "ShaleanLiveSeoCrawl/1.0",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    const location = res.headers.get("location");
    const buf = res.status === 200 ? await res.text() : "";
    return { status: res.status, location, body: buf.slice(0, 250_000) };
  } finally {
    clearTimeout(t);
  }
}

/** HEAD probe with GET fallback when HEAD is not allowed. */
export async function probePathStatus(url: string, timeoutMs = 12_000): Promise<number> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const head = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      signal: ac.signal,
      headers: { "user-agent": "ShaleanLiveSeoCrawl/1.0" },
    });
    if (head.status !== 405 && head.status !== 501) return head.status;
  } catch {
    // fall through to GET
  } finally {
    clearTimeout(t);
  }

  const ac2 = new AbortController();
  const t2 = setTimeout(() => ac2.abort(), timeoutMs);
  try {
    const get = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: ac2.signal,
      headers: { "user-agent": "ShaleanLiveSeoCrawl/1.0" },
    });
    return get.status;
  } catch {
    return 0;
  } finally {
    clearTimeout(t2);
  }
}

/** Paths we crawl for rendered internal-link hygiene (money + editorial surfaces). */
export const LIVE_INTERNAL_LINK_SEED_PATHS = [
  "/",
  "/services",
  "/services/standard-cleaning-cape-town",
  "/services/deep-cleaning-cape-town",
  "/services/airbnb-cleaning-cape-town",
  "/services/office-cleaning-cape-town",
  "/services/move-out-cleaning-cape-town",
  "/services/carpet-cleaning-cape-town",
  "/services/window-cleaning-cape-town",
  "/blog",
  "/faq",
  "/reviews",
  "/about",
  "/contact",
] as const;

/** Skip non-indexable / auth / API targets when validating marketing internal links. */
export function shouldSkipLiveInternalLinkTarget(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p === "/") return false;
  const skipPrefixes = [
    "/admin",
    "/office",
    "/api",
    "/cleaner",
    "/payment",
    "/pay",
    "/offer",
    "/dashboard",
    "/account",
    "/auth",
    "/track",
    "/lp",
    "/login",
    "/signup",
    "/book",
    "/booking",
  ];
  return skipPrefixes.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

/** 404/410 are broken; 5xx is unhealthy; redirects are acceptable for live probes. */
export function isBrokenInternalLinkStatus(status: number): boolean {
  return status === 404 || status === 410 || status === 0 || status >= 500;
}
