/**
 * SEO-FIX-001/002 — scoped Search Console validation helpers.
 *
 * Modes:
 * - `validate`: URL Inspection ×5 + conditional single sitemap submit
 * - `inspect-only`: URL Inspection ×5 only (weekly monitoring)
 *
 * Explicitly does NOT:
 * - Call the Indexing API / claim GSC UI "Request Indexing"
 * - Submit removals, change properties, Change of Address, or inspect other URLs
 * - Loop / repeatedly resubmit the sitemap
 */

import { google, searchconsole_v1 } from "googleapis";
import {
  describeGscConfigError,
  normalizeGscPrivateKey,
  readGscCredentials,
  type GscCredentials,
} from "@/lib/gsc/gsc-config";

export const SEO_FIX_001_002_CONFIRM_PHRASE = "SEO-FIX-001/002-GSC-ONLY";

export const SEO_FIX_001_002_ORIGIN = "https://shalean.co.za";
export const SEO_FIX_001_002_SITEMAP_FEED = `${SEO_FIX_001_002_ORIGIN}/sitemap.xml`;

/** Exact SEO-FIX-001/002 remediation set — do not expand. */
export const SEO_FIX_001_002_REMEDIATED_PATHS = [
  "/services/deep-cleaning-cape-town",
  "/services/airbnb-cleaning-cape-town",
  "/services/office-cleaning-cape-town",
  "/services/move-out-cleaning-cape-town",
  "/services/window-cleaning-cape-town",
] as const;

export const SEO_FIX_001_002_REMEDIATED_URLS = SEO_FIX_001_002_REMEDIATED_PATHS.map(
  (p) => `${SEO_FIX_001_002_ORIGIN}${p}`,
);

/** Production merge + deploy of PR #89 (SEO-FIX-001/002). */
export const SEO_FIX_001_002_PRODUCTION_MERGE_SHA =
  "28aa82ca2da8680baf88673fac20cdb5b0af80e0";
export const SEO_FIX_001_002_PRODUCTION_DEPLOYED_AT = "2026-07-22T15:15:16Z";

/** Weekly inspect-only window: 8 Wednesdays ending 2026-09-16. */
export const SEO_FIX_001_002_WEEKLY_INSPECT_START = "2026-07-29";
export const SEO_FIX_001_002_WEEKLY_INSPECT_END = "2026-09-16";
export const SEO_FIX_001_002_WEEKLY_SCHEDULE_CRON = "0 9 * * 3";

const WEBMASTERS_SCOPE = "https://www.googleapis.com/auth/webmasters";

export type SeoFix001002Mode = "validate" | "inspect-only";

export type SeoFix001002InspectionRow = {
  inspectionUrl: string;
  ok: boolean;
  inspectionResultLink?: string | null;
  verdict?: string | null;
  coverageState?: string | null;
  robotsTxtState?: string | null;
  indexingState?: string | null;
  pageFetchState?: string | null;
  lastCrawlTime?: string | null;
  googleCanonical?: string | null;
  userCanonical?: string | null;
  sitemap?: string[] | null;
  referringUrls?: string[] | null;
  error?: string;
};

export type SeoFix001002SitemapDecision =
  | {
      action: "submit";
      reason: string;
      feedpath: string;
      lastSubmittedBefore: string | null;
      productionDeployedAt: string;
      ok: boolean;
      errors?: number | null;
      warnings?: number | null;
      after?: unknown;
      error?: string;
    }
  | {
      action: "skip";
      reason: string;
      feedpath: string;
      lastSubmittedBefore: string | null;
      productionDeployedAt: string;
      ok: boolean;
      errors?: number | null;
      warnings?: number | null;
      existing?: unknown;
    };

export type SeoFix001002Evidence = {
  authorizedAt: string;
  mode: SeoFix001002Mode;
  confirmationPhraseAccepted: boolean;
  productionMergeSha: string;
  productionDeployedAt: string;
  siteUrl: string;
  siteUrlAuthorized: boolean;
  clientEmailMasked: string;
  serviceAccountHasPropertyAccess: boolean | null;
  secretsLogged: false;
  sitemap: SeoFix001002SitemapDecision | null;
  inspections: SeoFix001002InspectionRow[];
  indexingApiRequests: [];
  requestIndexingUiRequired: true;
  requestIndexingUiNote: string;
  errors: string[];
  outOfScopeRefused: string[];
  weeklyMonitor: {
    scheduleCron: string;
    startDate: string;
    endDate: string;
    runs: number;
    mode: "inspect-only";
    forbidden: string[];
  };
};

export function maskGscServiceAccountEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return "(invalid)";
  return `${user.slice(0, 3)}…@${domain}`;
}

export function assertSeoFix001002ConfirmPhrase(phrase: string | null | undefined): void {
  if (phrase !== SEO_FIX_001_002_CONFIRM_PHRASE) {
    throw new Error(
      `Refusing: confirmation phrase must be exactly ${SEO_FIX_001_002_CONFIRM_PHRASE}`,
    );
  }
}

export function isAuthorizedSeoFix001002SiteUrl(siteUrl: string): boolean {
  const normalized = siteUrl.trim().replace(/\/+$/, "");
  return (
    normalized === "sc-domain:shalean.co.za" ||
    normalized === "https://shalean.co.za" ||
    normalized === "http://shalean.co.za"
  );
}

export function assertScopedSeoFix001002Url(url: string): void {
  const allowed = new Set<string>([
    ...SEO_FIX_001_002_REMEDIATED_URLS,
    SEO_FIX_001_002_SITEMAP_FEED,
  ]);
  if (!allowed.has(url)) {
    throw new Error(`Refused out-of-scope URL: ${url}`);
  }
}

export function isWeeklyInspectWindowOpen(
  now = new Date(),
  startYmd = SEO_FIX_001_002_WEEKLY_INSPECT_START,
  endYmd = SEO_FIX_001_002_WEEKLY_INSPECT_END,
): boolean {
  const ymd = now.toISOString().slice(0, 10);
  return ymd >= startYmd && ymd <= endYmd;
}

/**
 * Submit sitemap only when the latest GSC submission predates the SEO-FIX production deploy.
 * Never loop or repeatedly resubmit within a run.
 */
export function decideSitemapSubmit(args: {
  lastSubmitted: string | null | undefined;
  productionDeployedAt?: string;
}): { shouldSubmit: boolean; reason: string } {
  const deployedAt = args.productionDeployedAt ?? SEO_FIX_001_002_PRODUCTION_DEPLOYED_AT;
  const last = args.lastSubmitted?.trim() || null;
  if (!last) {
    return {
      shouldSubmit: true,
      reason: "No prior sitemap submission recorded for this feedpath.",
    };
  }
  const lastMs = Date.parse(last);
  const deployedMs = Date.parse(deployedAt);
  if (!Number.isFinite(lastMs)) {
    return {
      shouldSubmit: true,
      reason: `Prior lastSubmitted was unparseable (${last}); submitting once.`,
    };
  }
  if (lastMs >= deployedMs) {
    return {
      shouldSubmit: false,
      reason: `Sitemap already submitted at ${last}, which is on/after production deploy ${deployedAt}; skipping resubmit.`,
    };
  }
  return {
    shouldSubmit: true,
    reason: `Latest submission ${last} predates production deploy ${deployedAt}; submitting once.`,
  };
}

function outOfScopeRefusedList(): string[] {
  return [
    "URL removals / temporary removals",
    "Property / ownership / user changes",
    "DNS / Plesk changes",
    "Change of Address",
    "Indexing API urlNotifications.publish (not equivalent to GSC UI Request Indexing)",
    "GSC UI Request Indexing button (manual only; not exposed by Search Console API for these pages)",
    "Any URL outside the five remediated service pages",
    "Any sitemap feed other than https://shalean.co.za/sitemap.xml",
    "Weekly inspect-only: sitemap submit, indexing requests, removals, property changes",
  ];
}

function emptyEvidence(
  mode: SeoFix001002Mode,
  creds: GscCredentials,
  started: string,
): SeoFix001002Evidence {
  return {
    authorizedAt: started,
    mode,
    confirmationPhraseAccepted: true,
    productionMergeSha: SEO_FIX_001_002_PRODUCTION_MERGE_SHA,
    productionDeployedAt: SEO_FIX_001_002_PRODUCTION_DEPLOYED_AT,
    siteUrl: creds.siteUrl,
    siteUrlAuthorized: isAuthorizedSeoFix001002SiteUrl(creds.siteUrl),
    clientEmailMasked: maskGscServiceAccountEmail(creds.clientEmail),
    serviceAccountHasPropertyAccess: null,
    secretsLogged: false,
    sitemap: null,
    inspections: [],
    indexingApiRequests: [],
    requestIndexingUiRequired: true,
    requestIndexingUiNote:
      "Ordinary Search Console API does not expose the GSC UI “Request Indexing” action for these standard service pages. Manual Request Indexing in Search Console UI remains required if desired.",
    errors: [],
    outOfScopeRefused: outOfScopeRefusedList(),
    weeklyMonitor: {
      scheduleCron: SEO_FIX_001_002_WEEKLY_SCHEDULE_CRON,
      startDate: SEO_FIX_001_002_WEEKLY_INSPECT_START,
      endDate: SEO_FIX_001_002_WEEKLY_INSPECT_END,
      runs: 8,
      mode: "inspect-only",
      forbidden: [
        "sitemap submit",
        "request indexing",
        "removals",
        "property changes",
        "Change of Address",
        "unrelated URL inspection",
      ],
    },
  };
}

function createSearchConsoleClient(creds: GscCredentials) {
  const auth = new google.auth.JWT({
    email: creds.clientEmail,
    key: normalizeGscPrivateKey(creds.privateKey),
    scopes: [WEBMASTERS_SCOPE],
  });
  return google.searchconsole({ version: "v1", auth });
}

async function inspectUrl(
  searchconsole: searchconsole_v1.Searchconsole,
  creds: GscCredentials,
  inspectionUrl: string,
): Promise<SeoFix001002InspectionRow> {
  assertScopedSeoFix001002Url(inspectionUrl);
  try {
    const res = await searchconsole.urlInspection.index.inspect({
      requestBody: {
        inspectionUrl,
        siteUrl: creds.siteUrl,
        languageCode: "en-US",
      },
    });
    const indexStatus = res.data.inspectionResult?.indexStatusResult ?? null;
    return {
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
  } catch (err) {
    const msg = describeGscConfigError(err, creds.siteUrl);
    return { inspectionUrl, ok: false, error: msg };
  }
}

function sitemapErrorWarningCounts(entry: searchconsole_v1.Schema$WmxSitemap | undefined): {
  errors: number | null;
  warnings: number | null;
} {
  if (!entry) return { errors: null, warnings: null };
  const errors =
    typeof entry.errors === "string"
      ? Number(entry.errors)
      : typeof entry.errors === "number"
        ? entry.errors
        : null;
  const warnings =
    typeof entry.warnings === "string"
      ? Number(entry.warnings)
      : typeof entry.warnings === "number"
        ? entry.warnings
        : null;
  return {
    errors: Number.isFinite(errors as number) ? (errors as number) : null,
    warnings: Number.isFinite(warnings as number) ? (warnings as number) : null,
  };
}

async function handleSitemap(
  searchconsole: searchconsole_v1.Searchconsole,
  creds: GscCredentials,
): Promise<SeoFix001002SitemapDecision> {
  assertScopedSeoFix001002Url(SEO_FIX_001_002_SITEMAP_FEED);

  let existing: searchconsole_v1.Schema$WmxSitemap | undefined;
  try {
    const listed = await searchconsole.sitemaps.list({ siteUrl: creds.siteUrl });
    existing = (listed.data.sitemap ?? []).find((s) => s.path === SEO_FIX_001_002_SITEMAP_FEED);
  } catch {
    // Fall through — get() below may still work.
  }

  try {
    const current = await searchconsole.sitemaps.get({
      siteUrl: creds.siteUrl,
      feedpath: SEO_FIX_001_002_SITEMAP_FEED,
    });
    existing = current.data;
  } catch {
    // Feed may not exist yet.
  }

  const lastSubmitted = existing?.lastSubmitted ?? null;
  const counts = sitemapErrorWarningCounts(existing);
  const decision = decideSitemapSubmit({ lastSubmitted });

  if (!decision.shouldSubmit) {
    return {
      action: "skip",
      reason: decision.reason,
      feedpath: SEO_FIX_001_002_SITEMAP_FEED,
      lastSubmittedBefore: lastSubmitted,
      productionDeployedAt: SEO_FIX_001_002_PRODUCTION_DEPLOYED_AT,
      ok: true,
      errors: counts.errors,
      warnings: counts.warnings,
      existing,
    };
  }

  try {
    await searchconsole.sitemaps.submit({
      siteUrl: creds.siteUrl,
      feedpath: SEO_FIX_001_002_SITEMAP_FEED,
    });
    const after = await searchconsole.sitemaps.get({
      siteUrl: creds.siteUrl,
      feedpath: SEO_FIX_001_002_SITEMAP_FEED,
    });
    const afterCounts = sitemapErrorWarningCounts(after.data);
    return {
      action: "submit",
      reason: decision.reason,
      feedpath: SEO_FIX_001_002_SITEMAP_FEED,
      lastSubmittedBefore: lastSubmitted,
      productionDeployedAt: SEO_FIX_001_002_PRODUCTION_DEPLOYED_AT,
      ok: true,
      errors: afterCounts.errors,
      warnings: afterCounts.warnings,
      after: after.data,
    };
  } catch (err) {
    const msg = describeGscConfigError(err, creds.siteUrl);
    return {
      action: "submit",
      reason: decision.reason,
      feedpath: SEO_FIX_001_002_SITEMAP_FEED,
      lastSubmittedBefore: lastSubmitted,
      productionDeployedAt: SEO_FIX_001_002_PRODUCTION_DEPLOYED_AT,
      ok: false,
      errors: counts.errors,
      warnings: counts.warnings,
      error: msg,
    };
  }
}

export type RunSeoFix001002ValidationArgs = {
  mode: SeoFix001002Mode;
  confirmPhrase: string;
  /** Injected credentials (tests). Defaults to process env via readGscCredentials(). */
  credentials?: GscCredentials | null;
  log?: (line: string) => void;
};

export async function runSeoFix001002Validation(
  args: RunSeoFix001002ValidationArgs,
): Promise<SeoFix001002Evidence> {
  assertSeoFix001002ConfirmPhrase(args.confirmPhrase);

  const started = new Date().toISOString();
  const creds = args.credentials === undefined ? readGscCredentials() : args.credentials;
  const log = args.log ?? console.log;

  if (!creds) {
    throw new Error(
      "Missing GSC credentials. Set GSC_CLIENT_EMAIL, GSC_PRIVATE_KEY, and GSC_SITE_URL on Vercel Production only.",
    );
  }

  const evidence = emptyEvidence(args.mode, creds, started);

  if (!evidence.siteUrlAuthorized) {
    evidence.errors.push(
      `GSC_SITE_URL=${creds.siteUrl} is not the authorised shalean.co.za Search Console property (expected sc-domain:shalean.co.za or https://shalean.co.za).`,
    );
    return evidence;
  }

  const searchconsole = createSearchConsoleClient(creds);

  // Prove property access without logging the private key.
  try {
    await searchconsole.sites.get({ siteUrl: creds.siteUrl });
    evidence.serviceAccountHasPropertyAccess = true;
    log(`[auth] service account has access to ${creds.siteUrl} (email=${evidence.clientEmailMasked})`);
  } catch (err) {
    evidence.serviceAccountHasPropertyAccess = false;
    const msg = describeGscConfigError(err, creds.siteUrl);
    evidence.errors.push(`property access check: ${msg}`);
    log(`[auth] FAIL property access: ${msg}`);
    return evidence;
  }

  for (const inspectionUrl of SEO_FIX_001_002_REMEDIATED_URLS) {
    const row = await inspectUrl(searchconsole, creds, inspectionUrl);
    evidence.inspections.push(row);
    if (!row.ok) {
      evidence.errors.push(`inspect ${inspectionUrl}: ${row.error ?? "unknown"}`);
      log(`[inspect] FAIL ${inspectionUrl}: ${row.error}`);
    } else {
      log(
        `[inspect] ${inspectionUrl} verdict=${row.verdict} coverage=${row.coverageState} robots=${row.robotsTxtState} fetch=${row.pageFetchState} crawl=${row.lastCrawlTime}`,
      );
    }
  }

  if (args.mode === "validate") {
    const sitemap = await handleSitemap(searchconsole, creds);
    evidence.sitemap = sitemap;
    if (!sitemap.ok) {
      evidence.errors.push(`sitemap ${sitemap.action}: ${"error" in sitemap ? sitemap.error : "unknown"}`);
      log(`[sitemap] FAIL: ${"error" in sitemap ? sitemap.error : "unknown"}`);
    } else {
      log(`[sitemap] ${sitemap.action}: ${sitemap.reason}`);
    }
  } else {
    evidence.sitemap = {
      action: "skip",
      reason: "inspect-only mode — sitemap submit forbidden for weekly runs.",
      feedpath: SEO_FIX_001_002_SITEMAP_FEED,
      lastSubmittedBefore: null,
      productionDeployedAt: SEO_FIX_001_002_PRODUCTION_DEPLOYED_AT,
      ok: true,
    };
    log("[sitemap] skipped (inspect-only)");
  }

  return evidence;
}
