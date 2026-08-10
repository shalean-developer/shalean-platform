/**
 * Google Search Console readiness probe for production/staging.
 *
 * `npm run validate:search-console-readiness`
 *
 * Checks live HTML, robots.txt, and explicit Search Console verification configuration.
 * Production CI should run this with REQUIRE_GSC_VERIFICATION=1.
 */

import {
  DEFAULT_AUDIT_BASE_URL,
  extractGoogleSiteVerificationToken,
  fetchWithNoRedirect,
  resolveAuditBaseUrl,
} from "@/lib/seo/liveSeoCrawl";
import { evaluateGscVerificationReadiness } from "@/lib/seo/search-console-readiness";

const baseEnv = resolveAuditBaseUrl(process.env.AUDIT_BASE_URL);
const requireVerification = process.env.REQUIRE_GSC_VERIFICATION === "1";

async function main(): Promise<void> {
  console.log(`[validate-search-console-readiness] Base ${baseEnv}`);

  const homeUrl = `${baseEnv}/`;
  const home = await fetchWithNoRedirect(homeUrl);
  if (home.status !== 200) {
    console.error(`[validate-search-console-readiness] Homepage fetch failed: ${homeUrl} → ${home.status}`);
    process.exit(1);
  }

  const token = extractGoogleSiteVerificationToken(home.body);
  const readiness = evaluateGscVerificationReadiness({
    baseUrl: baseEnv,
    htmlVerificationToken: token,
    verificationMethod: process.env.GSC_VERIFICATION_METHOD,
    siteUrl: process.env.GSC_SITE_URL,
  });

  if (!readiness.ok) {
    const msg = readiness.reason ?? "Search Console verification readiness failed.";
    if (requireVerification) {
      console.error(`[validate-search-console-readiness] FAILED — ${msg}`);
      process.exit(1);
    }
    console.warn(`[validate-search-console-readiness] WARN — ${msg}`);
  } else {
    console.log(
      `[validate-search-console-readiness] Search Console verification configured via ${readiness.method}`,
    );
  }

  const robotsUrl = `${baseEnv}/robots.txt`;
  const robots = await fetchWithNoRedirect(robotsUrl);
  if (robots.status !== 200) {
    console.error(`[validate-search-console-readiness] robots.txt fetch failed: ${robotsUrl} → ${robots.status}`);
    process.exit(1);
  }

  const sitemapLine = robots.body
    .split(/\r?\n/)
    .find((line) => /^\s*sitemap\s*:/i.test(line));
  if (!sitemapLine) {
    console.error("[validate-search-console-readiness] FAILED — robots.txt has no Sitemap: directive");
    process.exit(1);
  }

  if (!sitemapLine.toLowerCase().includes("sitemap.xml")) {
    console.error(`[validate-search-console-readiness] FAILED — unexpected sitemap line: ${sitemapLine.trim()}`);
    process.exit(1);
  }

  console.log(`[validate-search-console-readiness] robots.txt declares sitemap (${sitemapLine.trim()})`);

  if (baseEnv === DEFAULT_AUDIT_BASE_URL && requireVerification && !readiness.ok) {
    console.error("[validate-search-console-readiness] Production Search Console readiness is incomplete.");
    process.exit(1);
  }

  console.log("[validate-search-console-readiness] OK");
}

void main();

export {};
