/**
 * Google Search Console readiness probe for production/staging.
 *
 * `npm run validate:search-console-readiness`
 *
 * Checks live HTML for `<meta name="google-site-verification">` and sitemap in robots.txt.
 * Set `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` on Vercel when this fails.
 */

import {
  DEFAULT_AUDIT_BASE_URL,
  extractGoogleSiteVerificationToken,
  fetchWithNoRedirect,
  resolveAuditBaseUrl,
} from "@/lib/seo/liveSeoCrawl";

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
  if (!token) {
    const msg =
      "Missing google-site-verification meta tag on homepage. Set NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION in Vercel (or verify via DNS in Search Console).";
    if (requireVerification) {
      console.error(`[validate-search-console-readiness] FAILED — ${msg}`);
      process.exit(1);
    }
    console.warn(`[validate-search-console-readiness] WARN — ${msg}`);
  } else {
    console.log("[validate-search-console-readiness] google-site-verification meta present");
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

  if (baseEnv === DEFAULT_AUDIT_BASE_URL && !token && requireVerification) {
    console.error(
      "[validate-search-console-readiness] Production is not verified for Search Console HTML tag method.",
    );
    process.exit(1);
  }

  console.log("[validate-search-console-readiness] OK");
}

void main();

export {};
