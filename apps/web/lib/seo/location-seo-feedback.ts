/**
 * Search Console → deploy feedback loop (no live API in-request).
 *
 * Set `LOCATION_SEO_FEEDBACK_JSON` to a JSON object shaped like:
 * `{ "titles": { … }, "descriptions": { … }, "titleVariant": { … }, "gscMetrics": { "sea-point-cleaning-services": { "impressions": 1200, "clicks": 48, "ctr": 0.04, "avg_position": 5.2 } } }`
 *
 * Values replace programmatic defaults after `buildLocationPageMetaTitle` /
 * `buildLocationPageMetaDescription`. Ship updates from GSC exports or scripts.
 *
 * **Ingest workflow:** Export queries/pages from GSC, pick winning title/description variants per hub slug,
 * build a JSON array `{ slug, meta_title?, meta_description? }[]`, then run:
 * `npx tsx scripts/gsc-rows-to-location-feedback-json.ts ./tmp/gsc-location-rows.json`
 * and paste the output into your deployment env (or merge with `rowsToLocationSeoFeedbackJson` in CI).
 *
 * **CTR-oriented examples** (merge into your JSON object):
 * - Title format: `Cleaning Services {Area} (From R300) | Trusted Local Cleaners` — match “From R…” to each hub band (see meta price hints).
 * - Description: price signal + trust (background-checked / insured) + action CTA, e.g.
 *   `Book trusted cleaners in Sea Point from ~R450. Background-checked teams, same-day when routing allows—see your exact price before you pay.`
 */

import type { LocationTitleVariantId } from "@/lib/seo/location-title-variants";

/**
 * Optional Search Console snapshot per hub slug (manual import — not fetched live).
 * Use decimals: `ctr` as 0–1 fraction (e.g. 0.048), `avg_position` as mean position.
 */
export type LocationGscMetricSnapshot = {
  impressions?: number;
  clicks?: number;
  ctr?: number;
  avg_position?: number;
};

export type LocationSeoFeedbackConfig = {
  titles?: Record<string, string>;
  descriptions?: Record<string, string>;
  /** Per-slug A/B/C template (`buildLocationPageMetaTitleForVariant`). Ignored when `titles[slug]` is set. */
  titleVariant?: Record<string, LocationTitleVariantId>;
  /** When a slug has no `titleVariant`, use this template (default **A**). */
  defaultTitleVariant?: LocationTitleVariantId;
  /** GSC performance rows keyed by programmatic hub slug — merge from exports / scripts. */
  gscMetrics?: Record<string, LocationGscMetricSnapshot>;
  /**
   * Optional per-variant GSC snapshots for sequential title tests (same slug, different calendar windows).
   * Used by the SEO optimizer to pick a winner when impressions + CTR lift thresholds are met.
   */
  gscVariantMetrics?: Record<string, Partial<Record<LocationTitleVariantId, LocationGscMetricSnapshot>>>;
};

function parseFeedback(): LocationSeoFeedbackConfig {
  const raw = process.env.LOCATION_SEO_FEEDBACK_JSON?.trim();
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object") return {};
    return v as LocationSeoFeedbackConfig;
  } catch {
    return {};
  }
}

let cached: LocationSeoFeedbackConfig | null = null;

function config(): LocationSeoFeedbackConfig {
  if (!cached) cached = parseFeedback();
  return cached;
}

function isVariantId(v: unknown): v is LocationTitleVariantId {
  return v === "A" || v === "B" || v === "C";
}

/** Explicit `titleVariant[slug]` from env only (no DB auto-layer). */
export function getExplicitEnvTitleVariant(slug: string): LocationTitleVariantId | null {
  const per = config().titleVariant?.[slug];
  return isVariantId(per) ? per : null;
}

/** `defaultTitleVariant` from env or **A**. */
export function getDefaultEnvTitleVariant(): LocationTitleVariantId {
  const d = config().defaultTitleVariant;
  return isVariantId(d) ? d : "A";
}

/**
 * Title template from env only — **does not** read `seo_auto_title_variant` (safe for sync CMS paths).
 * Location hubs should use {@link resolveLocationTitleVariant} for the full merge chain.
 */
export function getLocationTitleVariant(slug: string): LocationTitleVariantId {
  return getExplicitEnvTitleVariant(slug) ?? getDefaultEnvTitleVariant();
}

export function getLocationGscVariantMetrics(
  slug: string,
): Partial<Record<LocationTitleVariantId, LocationGscMetricSnapshot>> | null {
  const raw = config().gscVariantMetrics?.[slug];
  if (!raw || typeof raw !== "object") return null;
  return raw;
}

/** Manual `<title>` override from env (`titles[slug]`); optimizer must never replace these. */
export function hasManualLocationMetaTitle(slug: string): boolean {
  return Boolean(config().titles?.[slug]?.trim());
}

/** Prefer Search Console–driven title when slug matches. */
export function mergeLocationMetaTitle(slug: string, fallbackTitle: string): string {
  const t = config().titles?.[slug]?.trim();
  return t || fallbackTitle;
}

/** Prefer Search Console–driven description when slug matches. */
export function mergeLocationMetaDescription(slug: string, fallbackDescription: string): string {
  const d = config().descriptions?.[slug]?.trim();
  return d || fallbackDescription;
}

/** Latest imported GSC metrics for a hub slug, if present in `LOCATION_SEO_FEEDBACK_JSON`. */
export function getLocationGscMetrics(slug: string): LocationGscMetricSnapshot | null {
  const m = config().gscMetrics?.[slug];
  if (!m || typeof m !== "object") return null;
  return m;
}

/** All slugs with GSC snapshots (for admin / tooling). */
export function listLocationGscMetricEntries(): { slug: string; metrics: LocationGscMetricSnapshot }[] {
  const raw = config().gscMetrics;
  if (!raw || typeof raw !== "object") return [];
  return Object.entries(raw).map(([slug, metrics]) => ({ slug, metrics }));
}
