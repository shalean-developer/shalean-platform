import type { MetadataRoute } from "next";
import { legacyMarketingRedirectSourcePaths } from "@/lib/seo/legacyMarketingRedirectMatrix";
import { isPathDisallowedByRobots } from "@/lib/seo/robotsPathRules";
import {
  PUBLIC_LEGACY_REDIRECT_ROBOTS_PATHS,
  SEO_CLEANER_APPLY_LANDING_SITEMAP_PATH,
  isSeoRebuildGonePath,
  seoRobotsAllowPaths,
  seoRobotsDisallowPaths,
} from "@/lib/seo/seoRebuildPhase1";
import { SITE_ORIGIN } from "@/lib/site/canonical";

const CANONICAL_HOST = "shalean.co.za";
const PRIVATE_PREFIXES = [
  "/admin",
  "/office",
  "/api",
  "/cleaner",
  "/payment",
  "/pay",
  "/dashboard",
  "/account",
  "/auth",
  "/login",
  "/track",
  "/lp",
  "/offer",
] as const;

/** Explicit public exceptions under otherwise-private prefixes (sitemap-safe). */
const PUBLIC_PRIVATE_PREFIX_EXCEPTIONS = new Set<string>([SEO_CLEANER_APPLY_LANDING_SITEMAP_PATH]);

export type SitemapValidationIssue = {
  readonly url: string;
  readonly code: string;
  readonly message: string;
};

function normalizePath(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

function isPrivatePath(pathname: string): boolean {
  const p = normalizePath(pathname);
  if (PUBLIC_PRIVATE_PREFIX_EXCEPTIONS.has(p)) return false;
  return PRIVATE_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

function isBlockedByRobots(pathname: string): boolean {
  return isPathDisallowedByRobots(pathname, {
    allow: seoRobotsAllowPaths(),
    disallow: seoRobotsDisallowPaths(),
  });
}

/**
 * Structural sitemap quality gates (no network).
 * Complements live `validate:live-seo` HTTP checks.
 */
export function validateMarketingSitemapEntries(
  entries: MetadataRoute.Sitemap,
  options?: { now?: Date },
): SitemapValidationIssue[] {
  const issues: SitemapValidationIssue[] = [];
  const now = options?.now ?? new Date();
  const seen = new Set<string>();
  const redirectSources = new Set(legacyMarketingRedirectSourcePaths());

  for (const entry of entries) {
    const url = entry.url;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      issues.push({ url, code: "invalid_url", message: "Not a valid absolute URL" });
      continue;
    }

    if (parsed.protocol !== "https:") {
      issues.push({ url, code: "non_https", message: "Sitemap URLs must use https" });
    }
    if (parsed.hostname === "www.shalean.co.za" || parsed.hostname.startsWith("www.")) {
      issues.push({ url, code: "www_host", message: "Sitemap must use apex host, not www" });
    }
    if (parsed.hostname === "shalean.com" || parsed.hostname === "www.shalean.com") {
      issues.push({ url, code: "com_host", message: "Sitemap must not use shalean.com" });
    }
    if (parsed.hostname !== CANONICAL_HOST) {
      issues.push({
        url,
        code: "non_canonical_host",
        message: `Host must be ${CANONICAL_HOST} (got ${parsed.hostname})`,
      });
    }
    if (SITE_ORIGIN.includes("www.") || SITE_ORIGIN.includes("shalean.com")) {
      issues.push({ url, code: "site_origin_drift", message: `SITE_ORIGIN is non-canonical: ${SITE_ORIGIN}` });
    }

    if (parsed.search && parsed.search !== "") {
      issues.push({
        url,
        code: "query_params",
        message: `Unapproved query string in sitemap URL: ${parsed.search}`,
      });
    }

    const path = normalizePath(parsed.pathname);
    if (seen.has(url) || seen.has(`${parsed.origin}${path}`)) {
      issues.push({ url, code: "duplicate", message: "Duplicate sitemap URL" });
    }
    seen.add(url);
    seen.add(`${parsed.origin}${path}`);

    if (redirectSources.has(path)) {
      issues.push({ url, code: "redirect_source", message: "Redirect source must not be in sitemap" });
    }
    if (isSeoRebuildGonePath(path)) {
      issues.push({ url, code: "gone_path", message: "410/gone path must not be in sitemap" });
    }
    if (isPrivatePath(path)) {
      issues.push({ url, code: "private_path", message: "Private/operational path must not be in sitemap" });
    }
    if (isBlockedByRobots(path)) {
      issues.push({ url, code: "robots_blocked", message: "URL is Disallow'd in robots.txt" });
    }

    const lm = entry.lastModified;
    if (lm == null) {
      issues.push({ url, code: "missing_lastmod", message: "lastmod required" });
    } else {
      const d = lm instanceof Date ? lm : new Date(lm);
      if (Number.isNaN(d.getTime())) {
        issues.push({ url, code: "invalid_lastmod", message: "lastmod is not a valid date" });
      } else if (d.getTime() > now.getTime() + 86_400_000) {
        issues.push({ url, code: "future_lastmod", message: "lastmod is in the future" });
      }
    }
  }

  return issues;
}

/** Assert public redirect URLs are not Disallow'd (regression guard for P0-3). */
export function assertPublicRedirectsNotBlockedByRobots(): SitemapValidationIssue[] {
  const issues: SitemapValidationIssue[] = [];
  const disallow = seoRobotsDisallowPaths();
  for (const path of PUBLIC_LEGACY_REDIRECT_ROBOTS_PATHS) {
    if (disallow.includes(path)) {
      issues.push({
        url: path,
        code: "robots_blocks_public_redirect",
        message: `robots Disallow includes public legacy path ${path}`,
      });
    }
  }
  for (const source of legacyMarketingRedirectSourcePaths()) {
    if (isBlockedByRobots(source)) {
      issues.push({
        url: source,
        code: "robots_blocks_marketing_redirect",
        message: `robots blocks marketing redirect source ${source}`,
      });
    }
  }
  return issues;
}
