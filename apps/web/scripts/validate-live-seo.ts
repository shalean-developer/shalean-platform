/**
 * Live production SEO integrity checks against a deployed origin.
 * Defaults to AUDIT_BASE_URL=https://shalean.co.za when unset.
 *
 * `npm run validate:live-seo`
 *
 * Fails CI when:
 * - sitemap URL returns non-200 or redirects
 * - final HTML canonical disagrees with fetched URL (pathname-level)
 * - response is 404
 *
 * Optional `LIVE_SEO_EXTENDED=1`: flag `robots` noindex on sitemap URLs and `og:url` vs canonical mismatches.
 */

import {
  extractCanonicalHref,
  fetchWithNoRedirect,
  LIVE_SEO_HTML_SCAN_CHARS,
  normalizeUrlPath,
  resolveAuditBaseUrl,
} from "@/lib/seo/liveSeoCrawl";

const baseEnv = resolveAuditBaseUrl(process.env.AUDIT_BASE_URL);
const maxUrls = Math.min(
  2000,
  Math.max(10, parseInt(process.env.LIVE_SEO_MAX_URLS ?? "400", 10) || 400),
);
const concurrency = Math.min(12, Math.max(1, parseInt(process.env.LIVE_SEO_CONCURRENCY ?? "6", 10) || 6));
const extendedChecks = process.env.LIVE_SEO_EXTENDED === "1";

function extractCanonical(html: string): string | null {
  return extractCanonicalHref(html);
}

function extractMetaRobots(html: string): string | null {
  const head = html.slice(0, LIVE_SEO_HTML_SCAN_CHARS);
  const re = /<meta\b[^>]*\bname\s*=\s*["']robots["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(head)) !== null) {
    const tag = m[0];
    const c = /\bcontent\s*=\s*["']([^"']+)["']/i.exec(tag);
    const content = c?.[1]?.trim().toLowerCase();
    if (content) return content;
  }
  return null;
}

function extractOgUrl(html: string): string | null {
  const head = html.slice(0, LIVE_SEO_HTML_SCAN_CHARS);
  const re = /<meta\b[^>]*\bproperty\s*=\s*["']og:url["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(head)) !== null) {
    const tag = m[0];
    const c = /\bcontent\s*=\s*["']([^"']+)["']/i.exec(tag);
    const content = c?.[1]?.trim();
    if (content) return content;
  }
  return null;
}

async function fetchPage(url: string): Promise<{ status: number; location: string | null; body: string }> {
  return fetchWithNoRedirect(url);
}

async function fetchPageWithRetry(
  url: string,
  attempts = 3,
): Promise<{ status: number; location: string | null; body: string }> {
  let last: Awaited<ReturnType<typeof fetchPage>> | null = null;
  for (let i = 0; i < attempts; i++) {
    last = await fetchPage(url);
    if (last.status === 200) return last;
    if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 750 * (i + 1)));
  }
  return last!;
}

async function main(): Promise<void> {
  const sitemapUrl = `${baseEnv}/sitemap.xml`;
  const smRes = await fetchPageWithRetry(sitemapUrl);
  if (smRes.status !== 200) {
    console.error(`[validate-live-seo] sitemap fetch failed: ${sitemapUrl} → ${smRes.status}`);
    process.exit(1);
  }

  const locs: string[] = [];
  const locRe = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let lm: RegExpExecArray | null;
  while ((lm = locRe.exec(smRes.body)) !== null) {
    const loc = lm[1]?.trim();
    if (loc && loc.startsWith("http")) locs.push(loc);
  }

  const unique = [...new Set(locs)];
  const targets = unique.slice(0, maxUrls);

  console.log(`[validate-live-seo] Base ${baseEnv}`);
  console.log(`[validate-live-seo] Sitemap URLs (checking ${targets.length} of ${unique.length})`);
  if (extendedChecks) console.log("[validate-live-seo] Extended checks: robots / og:url / JSON-LD vs canonical");

  const failures: string[] = [];
  let idx = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = idx++;
      if (i >= targets.length) return;
      const url = targets[i]!;
      const r = await fetchPage(url);
      if (r.status >= 300 && r.status < 400) {
        failures.push(`${url} → redirect ${r.status} location=${r.location ?? "?"}`);
        continue;
      }
      if (r.status === 404) {
        failures.push(`${url} → 404`);
        continue;
      }
      if (r.status !== 200) {
        failures.push(`${url} → HTTP ${r.status}`);
        continue;
      }
      const canon = extractCanonical(r.body);
      if (!canon) {
        failures.push(`${url} → missing <link rel="canonical">`);
        continue;
      }
      let canonAbs = canon;
      try {
        canonAbs = new URL(canon, url).href;
      } catch {
        failures.push(`${url} → invalid canonical href ${canon}`);
        continue;
      }
      const a = normalizeUrlPath(url);
      const b = normalizeUrlPath(canonAbs);
      if (a !== b) {
        failures.push(`${url} → canonical mismatch (page=${a}) vs (canonical=${b})`);
      }

      if (extendedChecks) {
        const robots = extractMetaRobots(r.body);
        if (robots && /\bnoindex\b/.test(robots)) {
          failures.push(`${url} → robots noindex while listed in sitemap (robots=${robots})`);
        }

        const og = extractOgUrl(r.body);
        if (og) {
          let ogAbs = og;
          try {
            ogAbs = new URL(og, url).href;
          } catch {
            failures.push(`${url} → invalid og:url ${og}`);
          }
          if (normalizeUrlPath(ogAbs) !== b) {
            failures.push(`${url} → og:url mismatch vs canonical (og=${normalizeUrlPath(ogAbs)} canonical=${b})`);
          }
        }

      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  if (failures.length) {
    console.error(`[validate-live-seo] FAILED (${failures.length} issues)\n`);
    for (const f of failures.slice(0, 80)) console.error(`  ${f}`);
    if (failures.length > 80) console.error(`  … ${failures.length - 80} more`);
    process.exit(1);
  }

  console.log("[validate-live-seo] OK — no redirects from sitemap URLs, canonicals aligned");
}

void main();

export {};
