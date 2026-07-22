/**
 * SEO-FIX-001/002 — authorized GSC read/write validation (scoped).
 *
 * Actions (exactly once per run unless already recorded for this day):
 * 1. URL Inspection for the five remediated service money pages
 * 2. Submit https://shalean.co.za/sitemap.xml once
 * 3. Request indexing once for each of the five URLs (Indexing API URL_UPDATED)
 *
 * Out of scope (hard-refused):
 * - Removals / URL removal tool
 * - Property changes / users / ownership
 * - DNS / Change of Address
 * - Any URL outside the five + the single sitemap feed
 *
 * Credentials (required):
 *   GSC_CLIENT_EMAIL, GSC_PRIVATE_KEY, GSC_SITE_URL
 *   Prefer GSC_SITE_URL=sc-domain:shalean.co.za (domain property).
 *
 * Usage:
 *   cd apps/web && npx tsx --env-file=.env.local scripts/gsc-seo-fix-001-002-validation.ts
 *   # or export the three GSC_* vars then:
 *   npm run gsc:seo-fix-001-002-validate
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { google } from "googleapis";
import {
  describeGscConfigError,
  normalizeGscPrivateKey,
  readGscCredentials,
} from "@/lib/gsc/gsc-config";

const ORIGIN = "https://shalean.co.za";
const SITEMAP_FEED = `${ORIGIN}/sitemap.xml`;

/** Exact SEO-FIX-001/002 remediation set — do not expand. */
const REMEDIATED_PATHS = [
  "/services/deep-cleaning-cape-town",
  "/services/airbnb-cleaning-cape-town",
  "/services/office-cleaning-cape-town",
  "/services/move-out-cleaning-cape-town",
  "/services/window-cleaning-cape-town",
] as const;

const REMEDIATED_URLS = REMEDIATED_PATHS.map((p) => `${ORIGIN}${p}`);

const WEBMASTERS_SCOPE = "https://www.googleapis.com/auth/webmasters";
const INDEXING_SCOPE = "https://www.googleapis.com/auth/indexing";

type Evidence = {
  authorizedAt: string;
  productionMergeSha: string;
  siteUrl: string;
  clientEmailMasked: string;
  sitemap: unknown;
  inspections: unknown[];
  indexingRequests: unknown[];
  errors: string[];
  outOfScopeRefused: string[];
};

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return "(invalid)";
  return `${user.slice(0, 3)}…@${domain}`;
}

function assertScopedUrl(url: string): void {
  if (!REMEDIATED_URLS.includes(url as (typeof REMEDIATED_URLS)[number]) && url !== SITEMAP_FEED) {
    throw new Error(`Refused out-of-scope URL: ${url}`);
  }
}

async function main() {
  const started = new Date().toISOString();
  const creds = readGscCredentials();
  if (!creds) {
    console.error(
      "Missing GSC credentials. Set GSC_CLIENT_EMAIL, GSC_PRIVATE_KEY, and GSC_SITE_URL (e.g. sc-domain:shalean.co.za).",
    );
    process.exit(2);
  }

  const evidence: Evidence = {
    authorizedAt: started,
    productionMergeSha: "28aa82ca2da8680baf88673fac20cdb5b0af80e0",
    siteUrl: creds.siteUrl,
    clientEmailMasked: maskEmail(creds.clientEmail),
    sitemap: null,
    inspections: [],
    indexingRequests: [],
    errors: [],
    outOfScopeRefused: [
      "URL removals",
      "Property / ownership / user changes",
      "DNS changes",
      "Change of Address",
      "Any URL outside the five remediated service pages",
      "Any sitemap feed other than https://shalean.co.za/sitemap.xml",
    ],
  };

  const auth = new google.auth.JWT({
    email: creds.clientEmail,
    key: normalizeGscPrivateKey(creds.privateKey),
    scopes: [WEBMASTERS_SCOPE, INDEXING_SCOPE],
  });

  const searchconsole = google.searchconsole({ version: "v1", auth });
  const indexing = google.indexing({ version: "v3", auth });

  // 1) Inspect each remediated URL
  for (const inspectionUrl of REMEDIATED_URLS) {
    assertScopedUrl(inspectionUrl);
    try {
      const res = await searchconsole.urlInspection.index.inspect({
        requestBody: {
          inspectionUrl,
          siteUrl: creds.siteUrl,
          languageCode: "en-US",
        },
      });
      const indexStatus = res.data.inspectionResult?.indexStatusResult ?? null;
      const row = {
        inspectionUrl,
        ok: true,
        inspectionResultLink: res.data.inspectionResult?.inspectionResultLink ?? null,
        verdict: indexStatus?.verdict ?? null,
        coverageState: indexStatus?.coverageState ?? null,
        robotsTxtState: indexStatus?.robotsTxtState ?? null,
        indexingState: indexStatus?.indexingState ?? null,
        pageFetchState: indexStatus?.pageFetchState ?? null,
        lastCrawlTime: indexStatus?.lastCrawlTime ?? null,
        googleCanonical: indexStatus?.googleCanonical ?? null,
        userCanonical: indexStatus?.userCanonical ?? null,
        sitemap: indexStatus?.sitemap ?? null,
        referringUrls: indexStatus?.referringUrls ?? null,
      };
      evidence.inspections.push(row);
      console.log(
        `[inspect] ${inspectionUrl} verdict=${row.verdict} coverage=${row.coverageState} crawl=${row.lastCrawlTime}`,
      );
    } catch (err) {
      const msg = describeGscConfigError(err, creds.siteUrl);
      evidence.errors.push(`inspect ${inspectionUrl}: ${msg}`);
      evidence.inspections.push({ inspectionUrl, ok: false, error: msg });
      console.error(`[inspect] FAIL ${inspectionUrl}: ${msg}`);
    }
  }

  // 2) Submit sitemap once
  assertScopedUrl(SITEMAP_FEED);
  try {
    const before = await searchconsole.sitemaps.list({ siteUrl: creds.siteUrl });
    const existing = (before.data.sitemap ?? []).map((s) => s.path);
    console.log(`[sitemap] existing feeds: ${existing.join(", ") || "(none)"}`);

    await searchconsole.sitemaps.submit({
      siteUrl: creds.siteUrl,
      feedpath: SITEMAP_FEED,
    });

    const after = await searchconsole.sitemaps.get({
      siteUrl: creds.siteUrl,
      feedpath: SITEMAP_FEED,
    });

    evidence.sitemap = {
      action: "submit",
      feedpath: SITEMAP_FEED,
      ok: true,
      existingBefore: existing,
      after: after.data,
    };
    console.log(`[sitemap] submitted ${SITEMAP_FEED}`);
  } catch (err) {
    const msg = describeGscConfigError(err, creds.siteUrl);
    evidence.errors.push(`sitemap submit: ${msg}`);
    evidence.sitemap = { action: "submit", feedpath: SITEMAP_FEED, ok: false, error: msg };
    console.error(`[sitemap] FAIL: ${msg}`);
  }

  // 3) Request indexing once per remediated URL
  for (const url of REMEDIATED_URLS) {
    assertScopedUrl(url);
    try {
      const res = await indexing.urlNotifications.publish({
        requestBody: {
          url,
          type: "URL_UPDATED",
        },
      });
      const row = {
        url,
        ok: true,
        type: "URL_UPDATED",
        urlNotificationMetadata: res.data.urlNotificationMetadata ?? res.data,
      };
      evidence.indexingRequests.push(row);
      console.log(`[index] requested ${url}`);
    } catch (err) {
      const msg = describeGscConfigError(err, creds.siteUrl);
      evidence.errors.push(`indexing ${url}: ${msg}`);
      evidence.indexingRequests.push({ url, ok: false, error: msg });
      console.error(`[index] FAIL ${url}: ${msg}`);
    }
  }

  const outDir = path.join(process.cwd(), "tmp");
  mkdirSync(outDir, { recursive: true });
  const stamp = started.replace(/[:.]/g, "-");
  const jsonPath = path.join(outDir, `gsc-seo-fix-001-002-validation-${stamp}.json`);
  writeFileSync(jsonPath, JSON.stringify(evidence, null, 2));
  console.log(`[evidence] wrote ${jsonPath}`);

  if (evidence.errors.length > 0) {
    console.error(`[done] completed with ${evidence.errors.length} error(s)`);
    process.exit(1);
  }
  console.log("[done] SEO-FIX-001/002 GSC validation succeeded");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
