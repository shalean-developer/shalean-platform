/**
 * Production /blog/* SEO reconciliation: SiteGuru CSV + live probes + sitemap + Supabase +
 * routed pools + redirect map + optional CMS validation JSON.
 *
 * Rule: **finalStatus in 2xx after full redirect chain = fixed-now** (avoids false panic on stale SiteGuru rows).
 *
 * Example:
 *   npm run reconcile:production-blog-404s -- --siteguru=PATH.csv \
 *     --out-json=reports/blog-404-reconciliation.json --out-csv=reports/blog-404-reconciliation.csv
 *
 * Optional: --origin= --sitemap-url= --cms-report= --delimiter= --broken-col= --linked-col=
 *           --max-rows= --concurrency=
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for published_in_db (warns if missing).
 */

import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { AIRBNB_HOST_GUIDE_POSTS } from "../lib/blog/airbnbHostGuidePosts";
import { fetchPublishedBlogSlugSet } from "../lib/blog/cms-blog-link-validation";
import { getAllHighConversionBlogPosts } from "../lib/blog/highConversionPosts";
import { ROUTED_PROGRAMMATIC_POSTS } from "../lib/blog/programmaticPosts";
import {
  BLOG_REDIRECT_SOURCE_TO_DEST,
  blogSlugFromPathname,
  getCanonicalBlogSlug,
  isRedirectAliasBlogSlug,
  normalizeBlogPathname,
  resolveBlogRedirectChain,
} from "../lib/blog/validBlogRoutes";
import { getSupabaseAdmin } from "../lib/supabase/admin";

type Classification =
  | "fixed-now"
  | "cms-cleanup-needed"
  | "needs-301"
  | "intentional-redirect"
  | "restore-content"
  | "image-error"
  | "unknown";

type Priority = "P0" | "P1" | "P2" | "P3";

export type ReconcileBlogRow = {
  broken_url: string;
  linked_from: string;
  current_status: string;
  in_sitemap: boolean;
  published_in_db: boolean;
  redirect_exists: boolean;
  classification: Classification;
  root_cause: string;
  recommended_action: string;
  redirect_target: string;
  priority: Priority;
  blog_slug?: string;
  static_redirect_resolved?: string;
  live_final_url?: string;
  in_routed_programmatic?: boolean;
  in_hc_pool?: boolean;
  in_airbnb_guides?: boolean;
  cms_report_hit?: boolean;
};

type CmsReportShape = { broken?: { brokenHref?: string; normalizedSlug?: string }[] };

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function apexOrigin(raw: string): string {
  const t = raw.trim().replace(/\/+$/, "");
  if (!t) return "https://shalean.co.za";
  try {
    const u = new URL(t.startsWith("http") ? t : `https://${t}`);
    if (u.hostname.toLowerCase() === "www.shalean.co.za") u.hostname = "shalean.co.za";
    return u.origin;
  } catch {
    return "https://shalean.co.za";
  }
}

function parseCsvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  const s = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(cur);
      cur = "";
    } else if (c === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else if (c === "\r") {
      /* skip */
    } else cur += c;
  }
  row.push(cur);
  if (row.some((c) => c.length > 0)) rows.push(row);
  return rows;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

function pickColumnIndex(
  headers: string[],
  explicit: string | undefined,
  predicates: ((h: string) => boolean)[],
): number {
  if (explicit) {
    const sub = explicit.trim().toLowerCase();
    const idx = headers.findIndex((h) => normalizeHeader(h).includes(sub));
    if (idx >= 0) return idx;
  }
  for (const pred of predicates) {
    const idx = headers.findIndex((h) => pred(normalizeHeader(h)));
    if (idx >= 0) return idx;
  }
  return -1;
}

function looksLikeUrl(s: string): boolean {
  const t = s.trim();
  return /^https?:\/\//i.test(t) || t.startsWith("/");
}

function normalizeToAbsoluteUrl(raw: string, origin: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    if (/^https?:\/\//i.test(t)) {
      const u = new URL(t);
      if (u.hostname.toLowerCase() === "www.shalean.co.za") u.hostname = "shalean.co.za";
      return u.href;
    }
    if (t.startsWith("/")) return new URL(t, origin).href;
    return new URL(`https://${t}`).href;
  } catch {
    return null;
  }
}

function blogSlugFromAnyUrl(href: string, origin: string): string | null {
  const abs = normalizeToAbsoluteUrl(href, origin);
  if (!abs) return null;
  try {
    const u = new URL(abs);
    return blogSlugFromPathname(normalizeBlogPathname(u.pathname));
  } catch {
    return null;
  }
}

function isImageProxyUrl(href: string): boolean {
  return /\/_next\/image/i.test(href) || /\/_next\/static/i.test(href);
}

function isMoneyPath(pathnameOrUrl: string): boolean {
  let p = pathnameOrUrl.toLowerCase();
  try {
    if (/^https?:\/\//i.test(pathnameOrUrl)) p = new URL(pathnameOrUrl).pathname.toLowerCase();
  } catch {
    /* */
  }
  return (
    p.includes("/locations/") ||
    p.includes("/cleaning-services-cape-town") ||
    p.includes("/cleaning-prices") ||
    p.includes("/maid-services") ||
    p === "/services" ||
    p.startsWith("/services/") ||
    p.includes("/booking")
  );
}

function pathnameIsBlog(pathOrUrl: string): boolean {
  try {
    const p = pathOrUrl.startsWith("http") ? new URL(pathOrUrl).pathname : pathOrUrl;
    return normalizeBlogPathname(p).startsWith("/blog");
  } catch {
    return false;
  }
}

type ProbeResult = {
  finalStatus: number;
  finalUrl: string;
  chain: string[];
  loop: boolean;
  error?: string;
};

async function fetchOnce(
  url: string,
  method: "HEAD" | "GET",
  signal: AbortSignal,
): Promise<Response> {
  const headers: Record<string, string> = { "user-agent": "ShaleanSEOReconcile/1.0" };
  if (method === "GET") headers.range = "bytes=0-0";
  return fetch(url, { method, redirect: "manual", signal, headers });
}

/**
 * Follow redirect chain until a non-3xx response or no Location.
 * `finalStatus` is the last HTTP status (e.g. 200 after 301→301→200).
 */
async function probeUrl(url: string, maxRedirects = 16, timeoutMs = 20000): Promise<ProbeResult> {
  const chain: string[] = [];
  let current = url;
  const seen = new Set<string>();
  let lastStatus = 0;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (seen.has(current)) {
      return { finalStatus: lastStatus, finalUrl: current, chain, loop: true };
    }
    seen.add(current);

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetchOnce(current, "HEAD", ac.signal);
      if (res.status === 405 || res.status === 501) {
        res = await fetchOnce(current, "GET", ac.signal);
      }
    } catch (e) {
      clearTimeout(timer);
      const msg = e instanceof Error ? e.message : String(e);
      return { finalStatus: 0, finalUrl: current, chain, loop: false, error: msg };
    } finally {
      clearTimeout(timer);
    }

    lastStatus = res.status;
    chain.push(String(res.status));

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) {
        return { finalStatus: res.status, finalUrl: current, chain, loop: false };
      }
      current = new URL(loc, current).href;
      continue;
    }

    return { finalStatus: res.status, finalUrl: current, chain, loop: false };
  }

  return { finalStatus: lastStatus, finalUrl: current, chain, loop: false };
}

function parseSitemapLocs(xml: string): Set<string> {
  const set = new Set<string>();
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) set.add(m[1]!.trim());
  return set;
}

function slugInSitemap(slug: string, sitemapUrls: Set<string>, origin: string): boolean {
  const canon = getCanonicalBlogSlug(slug);
  const candidates = [`${origin}/blog/${canon}`, `${origin}/blog/${canon}/`];
  for (const c of candidates) {
    if (sitemapUrls.has(c)) return true;
    const n = c.replace(/\/+$/, "");
    for (const u of sitemapUrls) {
      if (u.replace(/\/+$/, "") === n) return true;
    }
  }
  return false;
}

function loadCmsReport(path: string | undefined): Map<string, true> {
  const hrefKeys = new Map<string, true>();
  if (!path) return hrefKeys;
  try {
    const raw = readFileSync(path, "utf8");
    const j = JSON.parse(raw) as CmsReportShape;
    for (const b of j.broken ?? []) {
      const h = String(b.brokenHref ?? "").trim().toLowerCase();
      if (h) hrefKeys.set(h, true);
      const sl = String(b.normalizedSlug ?? "").trim().toLowerCase();
      if (sl) hrefKeys.set(`/blog/${sl}`, true);
    }
  } catch (e) {
    console.warn("[reconcile] Could not read cms-report:", e instanceof Error ? e.message : e);
  }
  return hrefKeys;
}

function cmsReportMatches(href: string, slug: string | null, cmsKeys: Map<string, true>, origin: string): boolean {
  const abs = normalizeToAbsoluteUrl(href, origin);
  if (abs && cmsKeys.has(abs.toLowerCase())) return true;
  if (abs) {
    try {
      const p = new URL(abs).pathname.toLowerCase();
      if (cmsKeys.has(normalizeBlogPathname(p).toLowerCase())) return true;
    } catch {
      /* */
    }
  }
  if (slug && cmsKeys.has(`/blog/${slug.toLowerCase()}`)) return true;
  return false;
}

function staticRedirectTargetForBlogPath(path: string): string {
  const n = path.startsWith("/") ? path : `/${path}`;
  const resolved = resolveBlogRedirectChain(n);
  return resolved !== normalizeBlogPathname(n) ? resolved : "";
}

function hadRedirectInChain(chain: readonly string[]): boolean {
  return chain.some((s) => {
    const n = Number(s);
    return n >= 300 && n < 400;
  });
}

function classifyAndRecommend(input: {
  slug: string | null;
  probe: ProbeResult;
  publishedInDb: boolean;
  inRoutedProgrammatic: boolean;
  inHc: boolean;
  inAirbnb: boolean;
  redirectSource: boolean;
  staticRedirectTarget: string;
  inSitemap: boolean;
  cmsHit: boolean;
  linkedFrom: string;
  isImage: boolean;
}): Pick<
  ReconcileBlogRow,
  "classification" | "root_cause" | "recommended_action" | "redirect_target" | "priority" | "current_status"
> {
  const {
    slug,
    probe,
    publishedInDb,
    inRoutedProgrammatic,
    inHc,
    inAirbnb,
    redirectSource,
    staticRedirectTarget,
    inSitemap,
    cmsHit,
    linkedFrom,
    isImage,
  } = input;

  const statusLabel =
    probe.error != null
      ? `error (${probe.error})`
      : `${probe.finalStatus}` + (probe.chain.length ? ` [${probe.chain.join("→")}]` : "");

  if (isImage) {
    return {
      current_status: statusLabel,
      classification: "image-error",
      root_cause: "Next image proxy or static asset URL flagged by crawler.",
      recommended_action: "Fix upstream image URL or featured image in CMS; do not add blog redirects.",
      redirect_target: "",
      priority: "P2",
    };
  }

  /** Final 2xx after full redirect chain = fixed-now */
  if (!probe.error && probe.finalStatus >= 200 && probe.finalStatus < 300) {
    return {
      current_status: statusLabel,
      classification: "fixed-now",
      root_cause: hadRedirectInChain(probe.chain)
        ? "Redirects in production; final response is 2xx. SiteGuru row is likely stale."
        : "URL returns 2xx in production; SiteGuru row is likely stale or a false positive.",
      recommended_action:
        "No new redirects. Re-crawl or dismiss in SiteGuru; fix internal links to canonical paths where still wrong.",
      redirect_target: probe.finalUrl,
      priority: "P3",
    };
  }

  if (probe.loop) {
    return {
      current_status: statusLabel,
      classification: "unknown",
      root_cause: "Redirect loop while probing production.",
      recommended_action: "Fix middleware / redirect rules before adding any redirects.",
      redirect_target: "",
      priority: "P1",
    };
  }

  if (probe.error) {
    return {
      current_status: statusLabel,
      classification: "unknown",
      root_cause: `Probe failed: ${probe.error}`,
      recommended_action: "Retry (network/TLS); then re-classify.",
      redirect_target: "",
      priority: "P3",
    };
  }

  /** Intentional redirect only when final is still 3xx (not 2xx). */
  if (probe.finalStatus >= 300 && probe.finalStatus < 400) {
    const nonBlog = !pathnameIsBlog(probe.finalUrl);
    if (nonBlog || redirectSource || (slug && isRedirectAliasBlogSlug(slug))) {
      return {
        current_status: statusLabel,
        classification: "intentional-redirect",
        root_cause:
          "Final response is still a redirect (no further Location or hop limit). Toward non-blog or cleanup-mapped target — not a final 2xx.",
        recommended_action:
          "Prefer updating internal links to the eventual destination; add 301 only for proven external/historical inbound value — never blind bulk redirects.",
        redirect_target: probe.finalUrl,
        priority: isMoneyPath(linkedFrom) ? "P1" : "P3",
      };
    }
  }

  if (probe.finalStatus === 404 || probe.finalStatus === 410) {
    if (cmsHit) {
      return {
        current_status: statusLabel,
        classification: "cms-cleanup-needed",
        root_cause: "404 and URL/slug appears in CMS blog link validation report.",
        recommended_action:
          "Fix blog_posts content_json / canonical_url / overrides to routable targets. Prefer internal link fixes over new redirects.",
        redirect_target: staticRedirectTarget || "",
        priority: isMoneyPath(linkedFrom) ? "P0" : "P2",
      };
    }
    if (publishedInDb && slug) {
      return {
        current_status: statusLabel,
        classification: "unknown",
        root_cause: "Published in Supabase but live response is 404 — deploy, cache, or routing mismatch.",
        recommended_action: "Verify production build and middleware; do not add redirects until confirmed.",
        redirect_target: staticRedirectTarget || "",
        priority: "P0",
      };
    }
    if (redirectSource && staticRedirectTarget) {
      return {
        current_status: statusLabel,
        classification: "needs-301",
        root_cause: "In-repo redirect map lists this path but live returned 404 — middleware/edge may not match map.",
        recommended_action: `Verify platform redirects match map; if backlinks justify it, implement 301 to ${staticRedirectTarget} — not blind pattern redirects.`,
        redirect_target: staticRedirectTarget,
        priority: "P1",
      };
    }
    if (inSitemap && slug && !publishedInDb && !inRoutedProgrammatic && !inHc && !inAirbnb) {
      return {
        current_status: statusLabel,
        classification: "restore-content",
        root_cause: "Listed in sitemap but no published DB row or static template serves this slug.",
        recommended_action:
          "Publish valid content or stop listing the URL in sitemap; restore content only when commercially justified.",
        redirect_target: "",
        priority: "P1",
      };
    }
    if (slug && isRedirectAliasBlogSlug(slug)) {
      return {
        current_status: statusLabel,
        classification: "intentional-redirect",
        root_cause: "Redirect-only alias slug (404 if hit directly); live routing should send users to canonical.",
        recommended_action:
          "Fix internal links to canonical slug; optional 301 for high-value external inbound only.",
        redirect_target: staticRedirectTarget || `/blog/${getCanonicalBlogSlug(slug)}`,
        priority: "P2",
      };
    }
    if (/\/blog\//i.test(linkedFrom) && slug) {
      return {
        current_status: statusLabel,
        classification: "cms-cleanup-needed",
        root_cause: "404 linked from another blog URL — likely CMS body / injected links.",
        recommended_action: "Edit source post(s) to remove or replace dead hrefs; avoid blind redirects.",
        redirect_target: staticRedirectTarget || "",
        priority: isMoneyPath(linkedFrom) ? "P0" : "P2",
      };
    }
    if (inRoutedProgrammatic || inHc || inAirbnb) {
      return {
        current_status: statusLabel,
        classification: "unknown",
        root_cause: "Slug exists in static pool but 404 live — env flags or deployment mismatch.",
        recommended_action: "Compare NEXT_PUBLIC_LEGACY_* with production; verify slug.",
        redirect_target: "",
        priority: "P1",
      };
    }
    return {
      current_status: statusLabel,
      classification: "unknown",
      root_cause: "404 without strong CMS/sitemap/map signal from inputs.",
      recommended_action:
        "Manual review (GSC, backlinks). Prefer internal link updates; 301 only with proven historical value.",
      redirect_target: staticRedirectTarget || "",
      priority: isMoneyPath(linkedFrom) ? "P0" : "P3",
    };
  }

  return {
    current_status: statusLabel,
    classification: "unknown",
    root_cause: `HTTP ${probe.finalStatus} after following redirects.`,
    recommended_action: "Manual review.",
    redirect_target: staticRedirectTarget || "",
    priority: "P3",
  };
}

function rowToCsvLine(cols: string[]): string {
  return cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",");
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    for (;;) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const siteguruPath = args.siteguru;
  if (!siteguruPath) {
    console.error("Missing required --siteguru=path/to.csv");
    process.exitCode = 1;
    return;
  }

  const origin = apexOrigin(args.origin ?? process.env.NEXT_PUBLIC_SITE_URL ?? "");
  const sitemapUrl = args["sitemap-url"] ?? `${origin}/sitemap.xml`;
  const outJson = args["out-json"] ?? "reports/blog-404-reconciliation.json";
  const outCsv = args["out-csv"] ?? "reports/blog-404-reconciliation.csv";
  const delimiter = args.delimiter ?? ",";
  const maxRows = Math.max(1, Math.min(5000, Number(args["max-rows"] ?? "2000") || 2000));
  const concurrency = Math.max(1, Math.min(20, Number(args.concurrency ?? "6") || 6));

  const csvText = readFileSync(siteguruPath, "utf8");
  const table = parseCsvRows(csvText, delimiter);
  if (table.length < 2) {
    console.error("[reconcile] CSV has no data rows.");
    process.exitCode = 1;
    return;
  }

  const headers = table[0]!.map((h) => h.trim());
  const brokenIdx = pickColumnIndex(headers, args["broken-col"], [
    (h) => h.includes("broken") && h.includes("url"),
    (h) => h.includes("404") && h.includes("url"),
    (h) => h.includes("error") && h.includes("url"),
    (h) => h === "url" || h === "address",
    (h) => h.includes("target url"),
    (h) => h.includes("page url"),
  ]);
  let linkedIdx = pickColumnIndex(headers, args["linked-col"], [
    (h) => h.includes("linked") || h.includes("referr") || h.includes("found on"),
    (h) => h.includes("source") && !h.includes("target"),
    (h) => h.includes("referring"),
  ]);
  if (brokenIdx < 0) {
    console.error("[reconcile] Could not detect broken URL column. Set --broken-col= header substring.");
    process.exitCode = 1;
    return;
  }
  if (linkedIdx < 0) {
    const alt = headers.findIndex((_, i) => i !== brokenIdx && looksLikeUrl(table[1]?.[i] ?? ""));
    linkedIdx = alt >= 0 ? alt : brokenIdx;
  }

  let sitemapUrls = new Set<string>();
  try {
    const sm = await fetch(sitemapUrl, { headers: { "user-agent": "ShaleanSEOReconcile/1.0" } });
    if (sm.ok) sitemapUrls = parseSitemapLocs(await sm.text());
    else console.warn("[reconcile] sitemap fetch failed:", sm.status, sitemapUrl);
  } catch (e) {
    console.warn("[reconcile] sitemap fetch error:", e instanceof Error ? e.message : e);
  }

  const admin = getSupabaseAdmin();
  const dbSet = admin ? await fetchPublishedBlogSlugSet(admin) : new Set<string>();
  if (!admin) console.warn("[reconcile] No Supabase admin — published_in_db will be false. Set URL + service role.");

  const progSlugs = new Set(ROUTED_PROGRAMMATIC_POSTS.map((p) => p.slug.toLowerCase()));
  const hcSlugs = new Set(getAllHighConversionBlogPosts().map((p) => p.slug.toLowerCase()));
  const airSlugs = new Set(AIRBNB_HOST_GUIDE_POSTS.map((p) => p.slug.toLowerCase()));
  const redirectSources = new Set(BLOG_REDIRECT_SOURCE_TO_DEST.keys());
  const cmsKeys = loadCmsReport(args["cms-report"]);

  type RawRow = { broken_url: string; linked_from: string };
  const rawRows: RawRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const row = table[r]!;
    const broken = (row[brokenIdx] ?? "").trim();
    const linked = (row[linkedIdx] ?? "").trim();
    if (!broken) continue;
    rawRows.push({ broken_url: broken, linked_from: linked });
    if (rawRows.length >= maxRows) break;
  }

  const results = await mapPool(rawRows, concurrency, async ({ broken_url, linked_from }) => {
    const isImage = isImageProxyUrl(broken_url);
    const absBroken = normalizeToAbsoluteUrl(broken_url, origin) ?? broken_url;
    const slug = isImage ? null : blogSlugFromAnyUrl(broken_url, origin);

    const pathForStatic = slug ? `/blog/${getCanonicalBlogSlug(slug)}` : "";
    const staticRedirectTarget = slug && pathForStatic ? staticRedirectTargetForBlogPath(pathForStatic) : "";
    const redirectSource = slug ? redirectSources.has(normalizeBlogPathname(`/blog/${slug}`)) : false;
    const redirectExists = redirectSource || Boolean(staticRedirectTarget);

    const publishedInDb = slug ? dbSet.has(slug.toLowerCase()) : false;
    const inRouted = slug ? progSlugs.has(slug.toLowerCase()) : false;
    const inHc = slug ? hcSlugs.has(slug.toLowerCase()) : false;
    const inAir = slug ? airSlugs.has(slug.toLowerCase()) : false;
    const inSitemap = slug ? slugInSitemap(slug, sitemapUrls, origin) : false;
    const cmsHit = cmsReportMatches(broken_url, slug, cmsKeys, origin);

    const probe = await probeUrl(absBroken);

    const meta = classifyAndRecommend({
      slug,
      probe,
      publishedInDb,
      inRoutedProgrammatic: inRouted,
      inHc,
      inAirbnb: inAir,
      redirectSource,
      staticRedirectTarget,
      inSitemap,
      cmsHit,
      linkedFrom: linked_from,
      isImage,
    });

    const row: ReconcileBlogRow = {
      broken_url,
      linked_from,
      current_status: meta.current_status,
      in_sitemap: inSitemap,
      published_in_db: publishedInDb,
      redirect_exists: redirectExists,
      classification: meta.classification,
      root_cause: meta.root_cause,
      recommended_action: meta.recommended_action,
      redirect_target: meta.redirect_target || staticRedirectTarget || probe.finalUrl,
      priority: meta.priority,
      blog_slug: slug ?? undefined,
      static_redirect_resolved: staticRedirectTarget || undefined,
      live_final_url: probe.finalUrl,
      in_routed_programmatic: inRouted,
      in_hc_pool: inHc,
      in_airbnb_guides: inAir,
      cms_report_hit: cmsHit,
    };
    return row;
  });

  mkdirSync(dirname(outJson), { recursive: true });
  writeFileSync(
    outJson,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        origin,
        sitemap_url: sitemapUrl,
        rows: results,
      },
      null,
      2,
    ),
    "utf8",
  );

  const csvHeader = [
    "broken_url",
    "linked_from",
    "current_status",
    "in_sitemap",
    "published_in_db",
    "redirect_exists",
    "classification",
    "root_cause",
    "recommended_action",
    "redirect_target",
    "priority",
  ];
  const csvLines = [csvHeader.join(",")];
  for (const r of results) {
    csvLines.push(
      rowToCsvLine([
        r.broken_url,
        r.linked_from,
        r.current_status,
        String(r.in_sitemap),
        String(r.published_in_db),
        String(r.redirect_exists),
        r.classification,
        r.root_cause,
        r.recommended_action,
        r.redirect_target,
        r.priority,
      ]),
    );
  }
  writeFileSync(outCsv, csvLines.join("\n"), "utf8");

  const summary = results.reduce(
    (acc, r) => {
      acc[r.classification] = (acc[r.classification] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  console.log("\n=== Production /blog/* reconciliation ===\n");
  console.log(`Origin: ${origin}`);
  console.log(`Rows: ${results.length} | Sitemap URLs: ${sitemapUrls.size} | DB slugs: ${dbSet.size}\n`);
  console.table(Object.entries(summary).map(([classification, count]) => ({ classification, count })));

  const actionable = results.filter((r) => r.classification !== "fixed-now");
  console.log(`\nNon–fixed-now: ${actionable.length}`);
  console.table(
    actionable.slice(0, 30).map((r) => ({
      priority: r.priority,
      class: r.classification,
      slug: r.blog_slug ?? "—",
      status: r.current_status.slice(0, 48),
    })),
  );
  console.log(`\nWrote JSON: ${outJson}`);
  console.log(`Wrote CSV: ${outCsv}\n`);
}

void main();
