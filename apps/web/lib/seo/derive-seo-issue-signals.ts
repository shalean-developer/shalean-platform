/**
 * Centralized heuristics for SEO hub triage — reuse in admin UI, cron output, and future automation.
 */

export type PageHealthBand = "critical" | "needs_improvement" | "strong";

/** Normalizes API/string payloads into a known band (defaults to strong). */
export function normalizePageHealthBand(raw: string | null | undefined): PageHealthBand {
  const s = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (s === "critical") return "critical";
  if (s === "needs_improvement") return "needs_improvement";
  if (s === "strong") return "strong";
  return "strong";
}

export type SeoIssueSignalsInput = {
  health_band: PageHealthBand;
  health_score: number;
};

export type ScrollSnapForSignals = {
  pct_to_50?: number | null;
  pct_to_75?: number | null;
};

export type GscSnapForSignals = {
  impressions?: number | null;
  ctr?: number | null;
  ctr_pct_display?: number | null;
  avg_position?: number | null;
};

export type SeoAffectedMetric = "acquisition" | "engagement" | "conversion" | "maintain";

export type SeoRecommendationType =
  | "title_meta"
  | "internal_links"
  | "content_depth"
  | "cta"
  | "maintain"
  | "unknown";

export type SeoIssueSignals = {
  priorityLabel: string;
  topIssue: string;
  recommendationType: SeoRecommendationType;
  /** 0–1 heuristic strength of the chosen rule. */
  confidence: number;
  affectedMetric: SeoAffectedMetric;
  /** Short label for UI badges (Acquisition, Engagement, …). */
  affectedMetricLabel: string;
};

const AFFECTED_LABEL: Record<SeoAffectedMetric, string> = {
  acquisition: "Acquisition",
  engagement: "Engagement",
  conversion: "Conversion",
  maintain: "Maintain",
};

export function priorityLabelFromBand(band: PageHealthBand): string {
  if (band === "critical") return "P1 · Critical";
  if (band === "needs_improvement") return "P2 · Watch";
  return "P3 · Healthy";
}

function ctrPct(gsc?: GscSnapForSignals): number | null {
  if (!gsc) return null;
  if (gsc.ctr_pct_display != null) return gsc.ctr_pct_display;
  if (typeof gsc.ctr === "number" && !Number.isNaN(gsc.ctr)) return Math.round(gsc.ctr * 10_000) / 100;
  return null;
}

/**
 * Derives triage copy and taxonomy from health band plus optional scroll/GSC context.
 */
export function deriveSeoIssueSignals(
  row: SeoIssueSignalsInput,
  scroll?: ScrollSnapForSignals,
  gsc?: GscSnapForSignals,
): SeoIssueSignals {
  const impr = gsc?.impressions ?? 0;
  const c = ctrPct(gsc);
  const pos = gsc?.avg_position ?? null;

  if (row.health_band === "critical") {
    if (c != null && c < 1.5 && impr > 400) {
      return {
        priorityLabel: priorityLabelFromBand(row.health_band),
        topIssue: "Low CTR vs impressions",
        recommendationType: "title_meta",
        confidence: 0.82,
        affectedMetric: "acquisition",
        affectedMetricLabel: AFFECTED_LABEL.acquisition,
      };
    }
    if (scroll && (scroll.pct_to_50 ?? 0) < 38) {
      return {
        priorityLabel: priorityLabelFromBand(row.health_band),
        topIssue: "Hero / intro drop-off",
        recommendationType: "content_depth",
        confidence: 0.78,
        affectedMetric: "engagement",
        affectedMetricLabel: AFFECTED_LABEL.engagement,
      };
    }
    return {
      priorityLabel: priorityLabelFromBand(row.health_band),
      topIssue: "Page health critical",
      recommendationType: "unknown",
      confidence: 0.55,
      affectedMetric: "acquisition",
      affectedMetricLabel: AFFECTED_LABEL.acquisition,
    };
  }

  if (row.health_band === "needs_improvement") {
    if (scroll && (scroll.pct_to_75 ?? 0) < 22) {
      return {
        priorityLabel: priorityLabelFromBand(row.health_band),
        topIssue: "Mid-page engagement weak",
        recommendationType: "content_depth",
        confidence: 0.76,
        affectedMetric: "engagement",
        affectedMetricLabel: AFFECTED_LABEL.engagement,
      };
    }
    if (pos != null && pos > 12) {
      return {
        priorityLabel: priorityLabelFromBand(row.health_band),
        topIssue: "Average rank slipping",
        recommendationType: "internal_links",
        confidence: 0.72,
        affectedMetric: "acquisition",
        affectedMetricLabel: AFFECTED_LABEL.acquisition,
      };
    }
    return {
      priorityLabel: priorityLabelFromBand(row.health_band),
      topIssue: "Room to grow — tune title + CTA",
      recommendationType: "cta",
      confidence: 0.65,
      affectedMetric: "conversion",
      affectedMetricLabel: AFFECTED_LABEL.conversion,
    };
  }

  return {
    priorityLabel: priorityLabelFromBand(row.health_band),
    topIssue: "Maintain momentum",
    recommendationType: "maintain",
    confidence: 0.5,
    affectedMetric: "maintain",
    affectedMetricLabel: AFFECTED_LABEL.maintain,
  };
}

export function affectedMetricBadgeClass(metric: SeoAffectedMetric): string {
  switch (metric) {
    case "acquisition":
      return "bg-violet-100 text-violet-900 dark:bg-violet-950/50 dark:text-violet-200";
    case "engagement":
      return "bg-sky-100 text-sky-950 dark:bg-sky-950/40 dark:text-sky-100";
    case "conversion":
      return "bg-amber-100 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100";
    case "maintain":
      return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  }
}
