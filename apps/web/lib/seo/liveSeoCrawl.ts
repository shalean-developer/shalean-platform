/**
 * Shared helpers for live production SEO crawlers (sitemap, internal links, GSC readiness).
 */

export const DEFAULT_AUDIT_BASE_URL = "https://shalean.co.za";

/** User-Agent for live production SEO crawls (must match `htmlLimitedBots` extras). */
export const LIVE_SEO_CRAWL_USER_AGENT = "ShaleanLiveSeoCrawl/1.0";

/**
 * How many leading HTML characters live SEO extractors inspect.
 * Streamed metadata that lands after this window is reported as missing.
 */
export const LIVE_SEO_HTML_SCAN_CHARS = 180_000;

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
  const head = html.slice(0, LIVE_SEO_HTML_SCAN_CHARS);
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

/**
 * First canonical href within the live SEO scan window (same logic as validate:live-seo).
 * Returns null when the tag is absent from the window — including when it only appears
 * later via Next.js streaming metadata in `<body>`.
 */
export function extractCanonicalHref(html: string): string | null {
  const head = html.slice(0, LIVE_SEO_HTML_SCAN_CHARS);
  const linkRe = /<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(head)) !== null) {
    const tag = m[0];
    const hrefM = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag);
    const href = hrefM?.[1]?.trim();
    if (href) return href;
  }
  return null;
}

export type LiveFetchResult = { status: number; location: string | null; body: string };

function isTransientLiveFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const name = error.name.toLowerCase();
  const message = error.message.toLowerCase();
  return name === "aborterror" || message.includes("aborted") || message.includes("timeout") || message.includes("timed out");
}

/**
 * Fetch one live page without following redirects. A production crawl is an external-network
 * check, so retry one transient timeout/abort before failing the PR. Persistent failures still
 * surface normally on the second attempt and remain blocking.
 */
export async function fetchWithNoRedirect(url: string, timeoutMs = 25_000): Promise<LiveFetchResult> {
  const maxAttempts = 2;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "manual",
        signal: ac.signal,
        headers: {
          "user-agent": LIVE_SEO_CRAWL_USER_AGENT,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      const location = res.headers.get("location");
      const buf = res.status === 200 ? await res.text() : "";
      return { status: res.status, location, body: buf.slice(0, 250_000) };
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isTransientLiveFetchError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 400));
    } finally {
      clearTimeout(t);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Live SEO fetch failed for ${url}`);
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
      headers: { "user-agent": LIVE_SEO_CRAWL_USER_AGENT },
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
      headers: { "user-agent": LIVE_SEO_CRAWL_USER_AGENT },
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
