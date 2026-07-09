import { locationHubPathFromAreaInput } from "@/lib/seo/capeTownLocations";
import { humanizeLocationSlug } from "@/lib/seo/humanize-location-slug";
import {
  computeSeoMomentumMovers,
  partitionSeoMomentumRisersFallers,
  type SeoMomentumMoverRow,
} from "@/lib/seo/compute-seo-momentum-movers";

export type SeoInsightsGscRow = {
  slug: string;
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  avg_position: number | null;
  prev_clicks?: number | null;
  prev_impressions?: number | null;
  prev_avg_position?: number | null;
  ctr_pct_display: number | null;
};

export type SeoInsightsGscTotals = {
  totalClicks: number;
  totalImpressions: number;
  previousClicks: number;
  previousImpressions: number;
  clicksTrendPct: number | null;
  impressionsTrendPct: number | null;
  currentStartDate?: string;
  currentEndDate?: string;
  previousStartDate?: string;
  previousEndDate?: string;
};

export type SeoInsightsClicksChartPoint = { label: string; value: number; date?: string };

export type SeoInsightsHealthRow = {
  slug: string;
  health_score: number;
  health_band: string;
  data_gaps?: SeoPageDataGaps;
  score_components?: { ctr: number; scroll: number; cta: number };
};

export type SeoPageDataGaps = {
  scroll_sessions_at_25: number;
  scroll_sessions_needed: number;
  scroll_ready: boolean;
  cta_sessions: number;
  cta_sessions_needed: number;
  cta_ready: boolean;
  gsc_impressions: number | null;
  ctr_pct: number | null;
  ctr_target_pct: number | null;
  avg_position: number | null;
  missing_signals: string[];
};

export type SeoInsightsRecommendation = {
  id: string;
  slug: string | null;
  kind?: string;
  severity: string;
  title: string;
  detail: unknown;
  created_at?: string;
};

export type SeoRecommendationSeverityFilter = "all" | "critical" | "warning" | "opportunity";

export type OfficeSeoRecommendationRow = SeoInsightsRecommendation & {
  severityFilter: Exclude<SeoRecommendationSeverityFilter, "all">;
  detailText: string | null;
  pageLabel: string | null;
};

export type SeoInsightsPeriodSlice = {
  since?: string;
  until?: string;
  rows_loaded?: number;
  scroll_depth_by_slug?: Array<{ slug: string; pct_to_100?: number | null; pct_read_to_100?: number | null }>;
  booking_starts_by_slug?: Array<{ slug: string; booking_starts: number }>;
  health_score_by_slug?: Array<{ slug: string; health_score: number }>;
};

export type SeoInsightsGscQueryRow = {
  query: string;
  slug: string;
  landing_page: string;
  clicks: number;
  impressions: number;
  ctr: number | null;
  avg_position: number | null;
  prev_clicks?: number;
  prev_impressions?: number;
  prev_avg_position?: number | null;
  ctr_pct_display: number | null;
};

export type SeoInsightsPayload = {
  since?: string;
  until?: string;
  rows_loaded?: number;
  gsc_import_snapshot: SeoInsightsGscRow[];
  gsc_import_count?: number;
  gsc_totals?: SeoInsightsGscTotals | null;
  gsc_clicks_chart?: SeoInsightsClicksChartPoint[];
  gsc_query_snapshot?: SeoInsightsGscQueryRow[];
  gsc_query_count?: number;
  gsc_queries_synced_at?: string | null;
  gsc_config_source?: "database" | "env" | "file" | "none";
  gsc_synced_at?: string | null;
  booking_starts_by_slug?: Array<{ slug: string; booking_starts: number }>;
  optimization: {
    page_health_table: SeoInsightsHealthRow[];
    recommendations: SeoInsightsRecommendation[];
  };
  periods?: {
    current_30d?: SeoInsightsPeriodSlice;
    previous_30d?: SeoInsightsPeriodSlice | null;
  };
};

export type OfficeSeoPageRow = {
  slug: string;
  label: string;
  healthScore: number;
  healthBand: string;
  healthDelta: number | null;
  impressions: number | null;
  clicks: number | null;
  prevClicks: number | null;
  ctrPct: number | null;
  avgPosition: number | null;
  bookingStarts: number;
  dataGaps: SeoPageDataGaps | null;
};

export type OfficeSeoKpis = {
  pagesTracked: number;
  avgHealth: number | null;
  criticalPages: number;
  insufficientDataPages: number;
  totalBookingStarts: number;
  gscPages: number;
  avgPosition: number | null;
};

export type OfficeSeoDataGapsSummary = {
  pagesWithGaps: number;
  commonGaps: { label: string; count: number }[];
  topPages: Array<{ slug: string; label: string; missing: string[] }>;
};

export type OfficeSeoDashboardSummary = {
  totalClicks: number;
  totalImpressions: number;
  avgCtrPct: number | null;
  avgPosition: number | null;
  avgHealth: number | null;
  pagesTracked: number;
  criticalPages: number;
  totalBookingStarts: number;
  bookingStartsTrendPct: number | null;
  gscClicksTrendPct: number | null;
  gscImpressionsTrendPct: number | null;
};

export type OfficeSeoSearchQueryRow = {
  keyword: string;
  slug: string;
  landingPage: string;
  clicks: number;
  impressions: number;
  ctrPct: number | null;
  position: number | null;
  trend: "up" | "down" | "flat";
  source: "gsc_query" | "page_proxy";
};

export type OfficeSeoIssueBreakdown = {
  critical: number;
  warnings: number;
  opportunities: number;
};

export type OfficeSeoHighlightRow = {
  label: string;
  value: string;
};

export type OfficeSeoActivityRow = {
  id: string;
  title: string;
  detail: string;
  when: string;
  tone: "positive" | "negative" | "neutral";
};

export type OfficeSeoSparkPoint = { label: string; value: number };

export type OfficeSeoMomentumMatrixPoint = {
  slug: string;
  label: string;
  hubHref: string;
  healthDelta: number;
  bookingsDelta: number;
};

function bandClass(band: string): string {
  if (band === "strong") return "bg-emerald-100 text-emerald-800";
  if (band === "needs_improvement") return "bg-amber-100 text-amber-800";
  if (band === "insufficient_data") return "bg-slate-100 text-slate-700";
  return "bg-red-100 text-red-800";
}

export function seoHealthBandClass(band: string): string {
  return bandClass(band);
}

export function recommendationDedupeKey(rec: {
  slug: string | null;
  kind?: string | null;
  title?: string;
}): string {
  return `${String(rec.slug ?? "_global")}|${String(rec.kind ?? rec.title ?? "unknown")}`;
}

export function mergeSeoRecommendations(
  dbRecs: Array<{
    id: string;
    slug: string | null;
    kind: string;
    severity: string;
    title: string;
    detail: unknown;
    created_at?: string;
  }>,
  engineRecs: SeoInsightsRecommendation[],
): SeoInsightsRecommendation[] {
  const byKey = new Map<string, SeoInsightsRecommendation>();

  for (const rec of dbRecs) {
    const key = recommendationDedupeKey(rec);
    const existing = byKey.get(key);
    const normalized: SeoInsightsRecommendation = {
      id: String(rec.id),
      slug: rec.slug,
      kind: rec.kind,
      severity: rec.severity,
      title: rec.title,
      detail: rec.detail,
      created_at: rec.created_at,
    };
    if (!existing?.created_at || (rec.created_at && rec.created_at > existing.created_at)) {
      byKey.set(key, normalized);
    }
  }

  for (const rec of engineRecs) {
    byKey.set(recommendationDedupeKey(rec), rec);
  }

  return sortSeoRecommendations([...byKey.values()]);
}

function sortSeoRecommendations(recs: SeoInsightsRecommendation[]): SeoInsightsRecommendation[] {
  const order: Record<string, number> = { critical: 0, warning: 1, opportunity: 2 };
  return recs.sort((a, b) => {
    const sa = classifyRecommendationSeverity(String(a.severity ?? ""));
    const sb = classifyRecommendationSeverity(String(b.severity ?? ""));
    if (order[sa] !== order[sb]) return order[sa]! - order[sb]!;
    return (a.slug ?? "").localeCompare(b.slug ?? "") || a.title.localeCompare(b.title);
  });
}

export function buildOfficeSeoRecommendationRows(
  data: SeoInsightsPayload | null,
  filter: SeoRecommendationSeverityFilter = "all",
): OfficeSeoRecommendationRow[] {
  const recs = data?.optimization.recommendations ?? [];
  return recs
    .map((rec) => {
      const severityFilter = classifyRecommendationSeverity(String(rec.severity ?? ""));
      return {
        ...rec,
        severityFilter,
        detailText: formatRecommendationDetail(rec.detail),
        pageLabel: rec.slug ? humanizeLocationSlug(rec.slug) : null,
      };
    })
    .filter((rec) => filter === "all" || rec.severityFilter === filter);
}

export function buildOfficeSeoIssuesCsv(rows: OfficeSeoRecommendationRow[]): string {
  const headers = ["Severity", "Title", "Page", "Slug", "Kind", "Detail"];
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        r.severityFilter,
        `"${r.title.replace(/"/g, '""')}"`,
        r.pageLabel ? `"${r.pageLabel.replace(/"/g, '""')}"` : "",
        r.slug ?? "",
        r.kind ?? "",
        r.detailText ? `"${r.detailText.replace(/"/g, '""')}"` : "",
      ].join(","),
    ),
  ];
  return lines.join("\r\n");
}

export function classifyRecommendationSeverity(severity: string): "critical" | "warning" | "opportunity" {
  const sev = severity.toLowerCase();
  if (sev === "critical" || sev === "error") return "critical";
  if (sev === "warning" || sev === "warn") return "warning";
  return "opportunity";
}

export function seoHealthBarColor(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-amber-500";
  if (score >= 40) return "bg-orange-500";
  return "bg-red-500";
}

export function formatRecommendationDetail(detail: unknown): string | null {
  if (detail == null) return null;
  if (typeof detail === "string") return detail.trim() || null;
  if (typeof detail !== "object") return String(detail);
  const d = detail as Record<string, unknown>;
  if (typeof d.hint === "string") return d.hint;
  const parts: string[] = [];
  if (typeof d.score === "number") parts.push(`Score ${d.score}`);
  if (typeof d.band === "string") parts.push(String(d.band).replace(/_/g, " "));
  if (typeof d.ctr_component === "number") parts.push(`CTR ${d.ctr_component} pts`);
  if (typeof d.scroll_component === "number") parts.push(`Scroll ${d.scroll_component} pts`);
  if (typeof d.cta_component === "number") parts.push(`Bookings ${d.cta_component} pts`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function pctTrend(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function metricTrend(current: number, previous: number): "up" | "down" | "flat" {
  if (current > previous) return "up";
  if (current < previous) return "down";
  return "flat";
}

function resolveGscTotals(data: SeoInsightsPayload | null): SeoInsightsGscTotals {
  if (data?.gsc_totals) return data.gsc_totals;
  const gsc = data?.gsc_import_snapshot ?? [];
  const totalClicks = gsc.reduce((s, r) => s + (r.clicks ?? 0), 0);
  const totalImpressions = gsc.reduce((s, r) => s + (r.impressions ?? 0), 0);
  const previousClicks = gsc.reduce((s, r) => s + (r.prev_clicks ?? 0), 0);
  const previousImpressions = gsc.reduce((s, r) => s + (r.prev_impressions ?? 0), 0);
  return {
    totalClicks,
    totalImpressions,
    previousClicks,
    previousImpressions,
    clicksTrendPct: pctTrend(totalClicks, previousClicks),
    impressionsTrendPct: pctTrend(totalImpressions, previousImpressions),
  };
}

export function buildOfficeSeoDashboardSummary(data: SeoInsightsPayload | null): OfficeSeoDashboardSummary {
  const kpis = buildOfficeSeoKpis(data);
  const totals = resolveGscTotals(data);
  const gsc = data?.gsc_import_snapshot ?? [];
  const ctrRows = gsc.filter((r) => typeof r.ctr === "number" && r.ctr > 0);
  const avgCtrPct =
    ctrRows.length > 0
      ? Math.round((ctrRows.reduce((s, r) => s + (r.ctr ?? 0), 0) / ctrRows.length) * 10_000) / 100
      : null;

  const curStarts = (data?.periods?.current_30d?.booking_starts_by_slug ?? data?.booking_starts_by_slug ?? []).reduce(
    (s, r) => s + r.booking_starts,
    0,
  );
  const prevStarts = (data?.periods?.previous_30d?.booking_starts_by_slug ?? []).reduce(
    (s, r) => s + r.booking_starts,
    0,
  );

  return {
    totalClicks: totals.totalClicks,
    totalImpressions: totals.totalImpressions,
    avgCtrPct,
    avgPosition: kpis.avgPosition,
    avgHealth: kpis.avgHealth,
    pagesTracked: kpis.pagesTracked,
    criticalPages: kpis.criticalPages,
    totalBookingStarts: curStarts || kpis.totalBookingStarts,
    bookingStartsTrendPct: pctTrend(curStarts || kpis.totalBookingStarts, prevStarts),
    gscClicksTrendPct: totals.clicksTrendPct,
    gscImpressionsTrendPct: totals.impressionsTrendPct,
  };
}

export function buildOfficeSeoSearchQueryRows(data: SeoInsightsPayload | null, limit = 10): OfficeSeoSearchQueryRow[] {
  const queryRows = data?.gsc_query_snapshot ?? [];
  if (queryRows.length > 0) {
    return aggregateGscQueriesByKeyword(queryRows)
      .slice(0, limit)
      .map((row) => ({
        keyword: row.keyword,
        slug: row.slug,
        landingPage: row.landingPage,
        clicks: row.clicks,
        impressions: row.impressions,
        ctrPct: row.ctrPct,
        position: row.position,
        trend: metricTrend(row.clicks, row.prevClicks),
        source: "gsc_query" as const,
      }));
  }

  return buildOfficeSeoPageRows(data)
    .filter((r) => (r.clicks ?? 0) > 0 || (r.impressions ?? 0) > 0)
    .sort((a, b) => (b.clicks ?? 0) - (a.clicks ?? 0) || (b.impressions ?? 0) - (a.impressions ?? 0))
    .slice(0, limit)
    .map((r) => ({
      keyword: r.label,
      slug: r.slug,
      landingPage: r.label,
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      ctrPct: r.ctrPct,
      position: r.avgPosition,
      trend:
        r.prevClicks != null
          ? metricTrend(r.clicks ?? 0, r.prevClicks)
          : r.healthDelta == null || r.healthDelta === 0
            ? "flat"
            : r.healthDelta > 0
              ? "up"
              : "down",
      source: "page_proxy" as const,
    }));
}

function aggregateGscQueriesByKeyword(rows: SeoInsightsGscQueryRow[]) {
  const map = new Map<
    string,
    {
      keyword: string;
      slug: string;
      landingPage: string;
      clicks: number;
      impressions: number;
      ctrPct: number | null;
      position: number | null;
      prevClicks: number;
      topPageClicks: number;
    }
  >();

  for (const row of rows) {
    const keyword = row.query.trim();
    if (!keyword) continue;
    const existing = map.get(keyword);
    const prevClicks = row.prev_clicks ?? 0;
    if (!existing) {
      map.set(keyword, {
        keyword,
        slug: row.slug,
        landingPage: row.landing_page,
        clicks: row.clicks,
        impressions: row.impressions,
        ctrPct: row.ctr_pct_display,
        position: row.avg_position,
        prevClicks,
        topPageClicks: row.clicks,
      });
      continue;
    }

    existing.clicks += row.clicks;
    existing.impressions += row.impressions;
    existing.prevClicks += prevClicks;
    existing.ctrPct =
      existing.impressions > 0
        ? Math.round((existing.clicks / existing.impressions) * 10_000) / 100
        : existing.ctrPct;

    if (row.avg_position != null) {
      const weight = row.impressions > 0 ? row.impressions : 1;
      const prevWeight = existing.impressions - row.impressions;
      if (existing.position != null && prevWeight > 0) {
        existing.position =
          Math.round(
            ((existing.position * prevWeight + row.avg_position * weight) / (prevWeight + weight)) * 10,
          ) / 10;
      } else {
        existing.position = row.avg_position;
      }
    }

    if (row.clicks > existing.topPageClicks) {
      existing.topPageClicks = row.clicks;
      existing.slug = row.slug;
      existing.landingPage = row.landing_page;
    }
  }

  return [...map.values()]
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .map(({ topPageClicks: _topPageClicks, ...row }) => row);
}

export function buildOfficeSeoSearchQueriesCsv(rows: OfficeSeoSearchQueryRow[]): string {
  const headers = ["Keyword", "Landing page", "Slug", "Clicks", "Impressions", "CTR %", "Position", "Source"];
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        `"${r.keyword.replace(/"/g, '""')}"`,
        `"${r.landingPage.replace(/"/g, '""')}"`,
        r.slug,
        r.clicks,
        r.impressions,
        r.ctrPct ?? "",
        r.position ?? "",
        r.source,
      ].join(","),
    ),
  ];
  return lines.join("\r\n");
}

export function buildOfficeSeoClicksChart(data: SeoInsightsPayload | null): SeoInsightsClicksChartPoint[] {
  return data?.gsc_clicks_chart ?? [];
}

export function buildOfficeSeoIssueBreakdown(data: SeoInsightsPayload | null): OfficeSeoIssueBreakdown {
  const recs = data?.optimization.recommendations ?? [];
  const breakdown: OfficeSeoIssueBreakdown = { critical: 0, warnings: 0, opportunities: 0 };
  for (const rec of recs) {
    const kind = classifyRecommendationSeverity(String(rec.severity ?? ""));
    if (kind === "critical") breakdown.critical += 1;
    else if (kind === "warning") breakdown.warnings += 1;
    else breakdown.opportunities += 1;
  }
  return breakdown;
}

export function buildOfficeSeoHighlights(data: SeoInsightsPayload | null): OfficeSeoHighlightRow[] {
  const summary = buildOfficeSeoDashboardSummary(data);
  const pageRows = buildOfficeSeoPageRows(data);
  const queryRows = buildOfficeSeoSearchQueryRows(data, 1);
  const topClicks = [...pageRows].sort((a, b) => (b.clicks ?? 0) - (a.clicks ?? 0))[0];
  const topImpressions = [...pageRows].sort((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0))[0];
  const topStarts = [...pageRows].sort((a, b) => b.bookingStarts - a.bookingStarts)[0];
  const topKeyword = queryRows[0];

  return [
    { label: "Click-through rate", value: summary.avgCtrPct != null ? `${summary.avgCtrPct}%` : "—" },
    { label: "Average position", value: summary.avgPosition != null ? String(summary.avgPosition) : "—" },
    { label: "Impressions", value: summary.totalImpressions.toLocaleString("en-ZA") },
    { label: "Clicks", value: summary.totalClicks.toLocaleString("en-ZA") },
    { label: "Top keyword", value: topKeyword?.keyword ?? topClicks?.label ?? "—" },
    { label: "Top landing page", value: topKeyword?.landingPage ?? topImpressions?.label ?? "—" },
    { label: "Top converter", value: topStarts?.label ?? "—" },
  ];
}

export function buildOfficeSeoActivityFeed(data: SeoInsightsPayload | null, limit = 8): OfficeSeoActivityRow[] {
  const items: OfficeSeoActivityRow[] = [];
  const { risers, fallers } = buildOfficeSeoMomentumMoverRows(data);

  for (const r of risers.slice(0, 4)) {
    items.push({
      id: `riser-${r.slug}`,
      title: `${r.label} improved`,
      detail: r.signalLine,
      when: "Last 30 days",
      tone: "positive",
    });
  }
  for (const f of fallers.slice(0, 3)) {
    items.push({
      id: `faller-${f.slug}`,
      title: `${f.label} declined`,
      detail: f.signalLine,
      when: "Last 30 days",
      tone: "negative",
    });
  }

  for (const rec of (data?.optimization.recommendations ?? []).slice(0, 4)) {
    const kind = classifyRecommendationSeverity(String(rec.severity ?? ""));
    items.push({
      id: rec.id,
      title: rec.title,
      detail: formatRecommendationDetail(rec.detail) ?? rec.slug ?? "SEO recommendation",
      when: "Open issue",
      tone: kind === "critical" ? "negative" : kind === "warning" ? "neutral" : "neutral",
    });
  }

  return items.slice(0, limit);
}

export function buildOfficeSeoMomentumMatrixPoints(data: SeoInsightsPayload | null): OfficeSeoMomentumMatrixPoint[] {
  const movers = buildOfficeSeoMomentumMovers(data);
  return movers
    .filter((m) => m.healthDelta != null)
    .slice(0, 40)
    .map((m) => ({
      slug: m.slug,
      label: humanizeLocationSlug(m.slug),
      hubHref: locationHubPathFromAreaInput(m.slug) as string,
      healthDelta: m.healthDelta ?? 0,
      bookingsDelta: m.bookingsDelta,
    }));
}

function buildOfficeSeoMomentumMovers(data: SeoInsightsPayload | null) {
  const cur = data?.periods?.current_30d;
  const prev = data?.periods?.previous_30d;
  if (!cur || !prev) return [];

  const slugs = new Set<string>();
  for (const r of cur.health_score_by_slug ?? []) slugs.add(r.slug);
  for (const r of prev.health_score_by_slug ?? []) slugs.add(r.slug);
  for (const r of cur.booking_starts_by_slug ?? []) slugs.add(r.slug);
  for (const r of prev.booking_starts_by_slug ?? []) slugs.add(r.slug);

  const toMap = <T extends { slug: string }>(rows: T[] | undefined, pick: (row: T) => number) =>
    new Map((rows ?? []).map((r) => [r.slug, pick(r)]));

  const curBook = toMap(cur.booking_starts_by_slug, (r) => r.booking_starts);
  const prevBook = toMap(prev.booking_starts_by_slug, (r) => r.booking_starts);
  const curHealth = toMap(cur.health_score_by_slug, (r) => r.health_score);
  const prevHealth = toMap(prev.health_score_by_slug, (r) => r.health_score);
  const curScroll = new Map((cur.scroll_depth_by_slug ?? []).map((r) => [r.slug, r]));
  const prevScroll = new Map((prev.scroll_depth_by_slug ?? []).map((r) => [r.slug, r]));

  return computeSeoMomentumMovers({
    slugs: [...slugs],
    curBook,
    prevBook,
    curScroll,
    prevScroll,
    curHealth,
    prevHealth,
  });
}

export function buildOfficeSeoMomentumMoverRows(data: SeoInsightsPayload | null): {
  risers: SeoMomentumMoverRow[];
  fallers: SeoMomentumMoverRow[];
} {
  const movers = buildOfficeSeoMomentumMovers(data);
  const { risers, fallers } = partitionSeoMomentumRisersFallers(movers);
  const enrich = (rows: typeof risers): SeoMomentumMoverRow[] =>
    rows.map((r) => ({
      ...r,
      label: humanizeLocationSlug(r.slug),
      hubHref: locationHubPathFromAreaInput(r.slug) as string,
    }));
  return { risers: enrich(risers), fallers: enrich(fallers) };
}

export function buildOfficeSeoPagesCsv(rows: OfficeSeoPageRow[]): string {
  const headers = [
    "Page",
    "Slug",
    "Health",
    "Band",
    "Impressions",
    "Clicks",
    "CTR %",
    "Position",
    "Booking starts",
  ];
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        `"${r.label.replace(/"/g, '""')}"`,
        r.slug,
        r.healthScore,
        r.healthBand,
        r.impressions ?? "",
        r.clicks ?? "",
        r.ctrPct ?? "",
        r.avgPosition ?? "",
        r.bookingStarts,
      ].join(","),
    ),
  ];
  return lines.join("\r\n");
}

export function buildOfficeSeoKpis(data: SeoInsightsPayload | null): OfficeSeoKpis {
  const rows = data?.optimization.page_health_table ?? [];
  const gsc = data?.gsc_import_snapshot ?? [];
  const bookingStarts = data?.booking_starts_by_slug ?? [];

  const avgHealth =
    rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.health_score, 0) / rows.length) : null;
  const positions = gsc
    .map((r) => r.avg_position)
    .filter((x): x is number => typeof x === "number" && !Number.isNaN(x));
  const avgPosition =
    positions.length > 0
      ? Math.round((positions.reduce((a, b) => a + b, 0) / positions.length) * 10) / 10
      : null;

  return {
    pagesTracked: rows.length,
    avgHealth,
    criticalPages: rows.filter((r) => r.health_band === "critical").length,
    insufficientDataPages: rows.filter((r) => r.health_band === "insufficient_data").length,
    totalBookingStarts: bookingStarts.reduce((s, r) => s + r.booking_starts, 0),
    gscPages: gsc.length,
    avgPosition,
  };
}

export function buildOfficeSeoDataGapsSummary(data: SeoInsightsPayload | null): OfficeSeoDataGapsSummary {
  const rows = buildOfficeSeoPageRows(data).filter((r) => r.dataGaps && r.dataGaps.missing_signals.length > 0);
  const gapCounts = new Map<string, number>();

  for (const row of rows) {
    for (const signal of row.dataGaps?.missing_signals ?? []) {
      let key = signal;
      if (signal.includes("scroll sessions")) key = "More scroll sessions (25% depth)";
      else if (signal.includes("CTA click sessions")) key = "More CTA click sessions";
      else if (signal.startsWith("Raise CTR")) key = "Improve CTR vs position benchmark";
      else if (signal.startsWith("Sync GSC")) key = "Add GSC metrics for slug";
      gapCounts.set(key, (gapCounts.get(key) ?? 0) + 1);
    }
  }

  const commonGaps = [...gapCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => ({ label, count }));

  const topPages = rows
    .slice()
    .sort((a, b) => (b.dataGaps?.missing_signals.length ?? 0) - (a.dataGaps?.missing_signals.length ?? 0))
    .slice(0, 8)
    .map((row) => ({
      slug: row.slug,
      label: row.label,
      missing: row.dataGaps?.missing_signals ?? [],
    }));

  return {
    pagesWithGaps: rows.length,
    commonGaps,
    topPages,
  };
}

export function buildOfficeSeoPageRows(data: SeoInsightsPayload | null): OfficeSeoPageRow[] {
  const rows = data?.optimization.page_health_table ?? [];
  const gscMap = new Map((data?.gsc_import_snapshot ?? []).map((r) => [r.slug, r]));
  const bookingMap = new Map((data?.booking_starts_by_slug ?? []).map((r) => [r.slug, r.booking_starts]));
  const prevMap = new Map(
    (data?.periods?.previous_30d?.health_score_by_slug ?? []).map((r) => [r.slug, r.health_score]),
  );

  return rows
    .map((row) => {
      const g = gscMap.get(row.slug);
      const prev = prevMap.get(row.slug);
      return {
        slug: row.slug,
        label: humanizeLocationSlug(row.slug),
        healthScore: row.health_score,
        healthBand: row.health_band,
        healthDelta: prev != null ? row.health_score - prev : null,
        impressions: g?.impressions ?? null,
        clicks: g?.clicks ?? null,
        prevClicks: g?.prev_clicks ?? null,
        ctrPct: g?.ctr_pct_display ?? (g?.ctr != null ? Math.round(g.ctr * 10_000) / 100 : null),
        avgPosition:
          g?.avg_position != null && !Number.isNaN(g.avg_position) ? Math.round(g.avg_position * 10) / 10 : null,
        bookingStarts: bookingMap.get(row.slug) ?? 0,
        dataGaps: row.data_gaps ?? null,
      };
    })
    .sort((a, b) => {
      const aHasGsc = a.impressions != null || a.avgPosition != null;
      const bHasGsc = b.impressions != null || b.avgPosition != null;
      if (aHasGsc !== bHasGsc) return aHasGsc ? -1 : 1;
      return a.healthScore - b.healthScore || b.bookingStarts - a.bookingStarts;
    });
}
