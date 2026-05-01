/**
 * SEO performance tracking — field contract for imports (Search Console, manual sheets, or vendors).
 * No external API wiring here; use snapshots for time-series in files or a future store.
 */

export type SeoMetricSource = "search_console" | "manual" | "third_party" | "unknown";

/** Single observation for a URL or content key. */
export type SeoPerformanceSnapshot = {
  /** Canonical page URL or site-relative path */
  url: string;
  /** Blog slug when row maps to `/blog/[slug]` */
  slug?: string;
  /** Calendar date of observation (YYYY-MM-DD) */
  date: string;
  /** Search impressions in the window */
  impressions?: number;
  /** Clicks in the window */
  clicks?: number;
  /** 0–1 when impressions > 0 */
  ctr?: number;
  /** Average position when available (e.g. GSC) */
  averagePosition?: number;
  /** Manual rank check or vendor “visibility” score */
  ranking?: number;
  /** Free-text rank notes (SERP features, volatility) */
  rankingNotes?: string;
  /** Query or page dimension label */
  dimension?: string;
  source?: SeoMetricSource;
  /** Raw payload reference (file path, export id) */
  rawRef?: string;
};

export type SeoPerformanceRollup = {
  slug: string;
  url: string;
  lastUpdated: string;
  snapshots: SeoPerformanceSnapshot[];
  /** Latest non-null aggregates for dashboards */
  latest?: {
    impressions?: number;
    clicks?: number;
    ctr?: number;
    averagePosition?: number;
    ranking?: number;
  };
};

export type SeoPerformanceLedger = {
  schemaVersion: 1;
  siteHost: string;
  rollups: SeoPerformanceRollup[];
};

export function emptyPerformanceLedger(siteHost: string): SeoPerformanceLedger {
  return { schemaVersion: 1, siteHost, rollups: [] };
}

export function mergeSnapshotIntoRollup(rollup: SeoPerformanceRollup, snap: SeoPerformanceSnapshot): SeoPerformanceRollup {
  const next = { ...rollup, snapshots: [...rollup.snapshots, snap].sort((a, b) => a.date.localeCompare(b.date)) };
  next.lastUpdated = snap.date;
  next.latest = {
    impressions: snap.impressions ?? rollup.latest?.impressions,
    clicks: snap.clicks ?? rollup.latest?.clicks,
    ctr: snap.ctr ?? rollup.latest?.ctr,
    averagePosition: snap.averagePosition ?? rollup.latest?.averagePosition,
    ranking: snap.ranking ?? rollup.latest?.ranking,
  };
  return next;
}
