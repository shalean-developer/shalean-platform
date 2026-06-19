/**
 * Search Console → deploy feedback loop (no live API in-request).
 *
 * Config is read from `process.env.LOCATION_SEO_FEEDBACK_JSON` only (client-safe).
 * Local file paths (`LOCATION_SEO_FEEDBACK_JSON_FILE`) are resolved at Next boot in `next.config.ts`.
 */

import type { LocationTitleVariantId } from "@/lib/seo/location-title-variants";
import type { LocationGscMetricSnapshot, LocationSeoFeedbackConfig } from "@/lib/seo/location-seo-feedback.types";

export type { LocationGscMetricSnapshot, LocationSeoFeedbackConfig } from "@/lib/seo/location-seo-feedback.types";

function readFeedbackJsonRaw(): string | null {
  const inline = process.env.LOCATION_SEO_FEEDBACK_JSON?.trim();
  return inline || null;
}

function parseFeedback(): LocationSeoFeedbackConfig {
  const raw = readFeedbackJsonRaw();
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object") return {};
    return v as LocationSeoFeedbackConfig;
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[location-seo-feedback] Invalid LOCATION_SEO_FEEDBACK_JSON — must be valid JSON.",
        err instanceof Error ? err.message : err,
      );
    }
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
