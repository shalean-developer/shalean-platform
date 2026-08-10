/**
 * Google Search Console–oriented constants and production readiness helpers.
 *
 * Production verification may use either:
 * - HTML meta verification (`google-site-verification`), or
 * - a DNS-verified Search Console domain property (`sc-domain:...`).
 *
 * CI must not silently downgrade readiness failures to warnings.
 */
import { SITE_ORIGIN } from "@/lib/site/canonical";

export const SEO_LOCATION_HUB_URL_PREFIX = `${SITE_ORIGIN}/locations/`;

/** Stable analytics dimensions you can mirror in BigQuery / GA4 custom params */
export const LOCATION_PAGE_CONTENT_GROUP = "seo_location_hub";

/** Pair with `LOCATION_SEO_FEEDBACK_JSON` + `scripts/gsc-rows-to-location-feedback-json.ts` for title/description iterations. */
export const LOCATION_HUB_GSC_URL_PREFIX_LABEL = "locations_hub_pages";

export type GscVerificationMethod = "html" | "dns";

export type GscReadinessInput = {
  baseUrl: string;
  htmlVerificationToken: string | null;
  verificationMethod?: string | null;
  siteUrl?: string | null;
};

export type GscReadinessResult = {
  ok: boolean;
  method: GscVerificationMethod | null;
  reason: string | null;
};

function normalizedHostname(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Evaluate whether the deployment has an explicit, production-safe Search Console
 * verification configuration. A DNS declaration is only accepted when the GSC
 * property exactly matches the audited hostname.
 */
export function evaluateGscVerificationReadiness(input: GscReadinessInput): GscReadinessResult {
  if (input.htmlVerificationToken?.trim()) {
    return { ok: true, method: "html", reason: null };
  }

  const method = input.verificationMethod?.trim().toLowerCase();
  if (method !== "dns") {
    return {
      ok: false,
      method: method === "html" ? "html" : null,
      reason:
        "No google-site-verification meta tag was found and GSC_VERIFICATION_METHOD is not set to dns.",
    };
  }

  const host = normalizedHostname(input.baseUrl);
  const siteUrl = input.siteUrl?.trim().toLowerCase();
  if (!host) {
    return { ok: false, method: "dns", reason: `Invalid audit base URL: ${input.baseUrl}` };
  }
  if (!siteUrl) {
    return { ok: false, method: "dns", reason: "GSC_SITE_URL is required for DNS verification." };
  }

  const expected = `sc-domain:${host}`;
  if (siteUrl !== expected) {
    return {
      ok: false,
      method: "dns",
      reason: `GSC_SITE_URL must be ${expected} for DNS verification; received ${input.siteUrl}.`,
    };
  }

  return { ok: true, method: "dns", reason: null };
}
