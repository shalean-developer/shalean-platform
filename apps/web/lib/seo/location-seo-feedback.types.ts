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
