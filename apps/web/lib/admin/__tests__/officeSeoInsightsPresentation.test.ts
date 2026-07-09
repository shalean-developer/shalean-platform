import { describe, expect, it } from "vitest";
import {
  buildOfficeSeoDataGapsSummary,
  buildOfficeSeoDashboardSummary,
  buildOfficeSeoIssueBreakdown,
  buildOfficeSeoKpis,
  buildOfficeSeoPageRows,
  buildOfficeSeoRecommendationRows,
  buildOfficeSeoSearchQueryRows,
  formatRecommendationDetail,
  mergeSeoRecommendations,
  recommendationDedupeKey,
} from "@/lib/admin/officeSeoInsightsPresentation";

describe("buildOfficeSeoPageRows", () => {
  it("merges health, GSC, and prior-period delta", () => {
    const rows = buildOfficeSeoPageRows({
      gsc_import_snapshot: [
        {
          slug: "sea-point-cleaning-services",
          impressions: 1200,
          clicks: 40,
          ctr: 0.04,
          avg_position: 6.2,
          ctr_pct_display: 4,
        },
      ],
      booking_starts_by_slug: [{ slug: "sea-point-cleaning-services", booking_starts: 3 }],
      optimization: {
        page_health_table: [
          { slug: "sea-point-cleaning-services", health_score: 58, health_band: "needs_improvement" },
        ],
        recommendations: [],
      },
      periods: {
        previous_30d: {
          health_score_by_slug: [{ slug: "sea-point-cleaning-services", health_score: 52 }],
        },
      },
    });

    expect(rows[0]?.healthDelta).toBe(6);
    expect(rows[0]?.ctrPct).toBe(4);
    expect(rows[0]?.bookingStarts).toBe(3);
  });

  it("sorts rows with GSC metrics ahead of rows without", () => {
    const rows = buildOfficeSeoPageRows({
      gsc_import_snapshot: [
        {
          slug: "sea-point-cleaning-services",
          impressions: 500,
          clicks: 20,
          ctr: 0.04,
          avg_position: 6,
          ctr_pct_display: 4,
        },
      ],
      optimization: {
        page_health_table: [
          { slug: "kenilworth-cleaning-services", health_score: 0, health_band: "critical" },
          { slug: "sea-point-cleaning-services", health_score: 0, health_band: "critical" },
        ],
        recommendations: [],
      },
    });

    expect(rows[0]?.slug).toBe("sea-point-cleaning-services");
    expect(rows[0]?.impressions).toBe(500);
  });
});

describe("buildOfficeSeoKpis", () => {
  it("summarizes tracked pages and critical count", () => {
    const kpis = buildOfficeSeoKpis({
      gsc_import_snapshot: [],
      optimization: {
        page_health_table: [
          { slug: "a", health_score: 40, health_band: "critical" },
          { slug: "b", health_score: 80, health_band: "strong" },
        ],
        recommendations: [],
      },
    });
    expect(kpis.pagesTracked).toBe(2);
    expect(kpis.avgHealth).toBe(60);
    expect(kpis.criticalPages).toBe(1);
  });
});

describe("buildOfficeSeoDataGapsSummary", () => {
  it("aggregates missing signals across pages", () => {
    const summary = buildOfficeSeoDataGapsSummary({
      gsc_import_snapshot: [],
      optimization: {
        page_health_table: [
          {
            slug: "sea-point-cleaning-services",
            health_score: 22,
            health_band: "insufficient_data",
            data_gaps: {
              scroll_sessions_at_25: 3,
              scroll_sessions_needed: 20,
              scroll_ready: false,
              cta_sessions: 0,
              cta_sessions_needed: 10,
              cta_ready: false,
              gsc_impressions: 120,
              ctr_pct: 2.8,
              ctr_target_pct: 3,
              avg_position: 21.7,
              missing_signals: ["Need 17 more scroll sessions (25% depth)"],
            },
          },
        ],
        recommendations: [],
      },
    });
    expect(summary.pagesWithGaps).toBe(1);
    expect(summary.commonGaps[0]?.label).toContain("scroll");
  });
});

describe("buildOfficeSeoDashboardSummary", () => {
  it("aggregates GSC clicks and impressions", () => {
    const summary = buildOfficeSeoDashboardSummary({
      gsc_import_snapshot: [
        {
          slug: "sea-point-cleaning-services",
          impressions: 1200,
          clicks: 40,
          ctr: 0.04,
          avg_position: 6.2,
          ctr_pct_display: 4,
        },
        {
          slug: "camps-bay-cleaning-services",
          impressions: 800,
          clicks: 20,
          ctr: 0.025,
          avg_position: 9.1,
          ctr_pct_display: 2.5,
        },
      ],
      booking_starts_by_slug: [{ slug: "sea-point-cleaning-services", booking_starts: 3 }],
      optimization: {
        page_health_table: [
          { slug: "sea-point-cleaning-services", health_score: 58, health_band: "needs_improvement" },
        ],
        recommendations: [],
      },
    });
    expect(summary.totalClicks).toBe(60);
    expect(summary.totalImpressions).toBe(2000);
    expect(summary.avgCtrPct).toBe(3.25);
  });
});

describe("buildOfficeSeoSearchQueryRows", () => {
  it("returns top pages by clicks when no query snapshot exists", () => {
    const rows = buildOfficeSeoSearchQueryRows({
      gsc_import_snapshot: [
        {
          slug: "a-cleaning-services",
          impressions: 100,
          clicks: 5,
          ctr: 0.05,
          avg_position: 10,
          ctr_pct_display: 5,
        },
        {
          slug: "b-cleaning-services",
          impressions: 200,
          clicks: 20,
          ctr: 0.1,
          avg_position: 5,
          ctr_pct_display: 10,
        },
      ],
      optimization: {
        page_health_table: [
          { slug: "a-cleaning-services", health_score: 50, health_band: "needs_improvement" },
          { slug: "b-cleaning-services", health_score: 70, health_band: "strong" },
        ],
        recommendations: [],
      },
    });
    expect(rows[0]?.slug).toBe("b-cleaning-services");
    expect(rows[0]?.clicks).toBe(20);
    expect(rows[0]?.source).toBe("page_proxy");
  });

  it("aggregates real GSC query rows by keyword with trend from prior period", () => {
    const rows = buildOfficeSeoSearchQueryRows({
      gsc_import_snapshot: [],
      gsc_query_snapshot: [
        {
          query: "cleaners sea point",
          slug: "sea-point-cleaning-services",
          landing_page: "Sea Point",
          clicks: 10,
          impressions: 300,
          ctr: 0.036,
          avg_position: 6.5,
          prev_clicks: 4,
          prev_impressions: 180,
          prev_avg_position: 7.2,
          ctr_pct_display: 3.6,
        },
        {
          query: "camps bay cleaning",
          slug: "camps-bay-cleaning-services",
          landing_page: "Camps Bay",
          clicks: 8,
          impressions: 200,
          ctr: 0.04,
          avg_position: 5.2,
          prev_clicks: 12,
          prev_impressions: 260,
          prev_avg_position: 4.8,
          ctr_pct_display: 4,
        },
      ],
      optimization: { page_health_table: [], recommendations: [] },
    });

    expect(rows[0]?.keyword).toBe("cleaners sea point");
    expect(rows[0]?.trend).toBe("up");
    expect(rows[1]?.trend).toBe("down");
  });

  it("uses gsc_totals for full click/impression KPIs", () => {
    const summary = buildOfficeSeoDashboardSummary({
      gsc_import_snapshot: [
        {
          slug: "a-cleaning-services",
          impressions: 100,
          clicks: 5,
          ctr: 0.05,
          avg_position: 10,
          ctr_pct_display: 5,
        },
      ],
      gsc_totals: {
        totalClicks: 180,
        totalImpressions: 42000,
        previousClicks: 150,
        previousImpressions: 38000,
        clicksTrendPct: 20,
        impressionsTrendPct: 10.5,
      },
      optimization: { page_health_table: [], recommendations: [] },
    });
    expect(summary.totalClicks).toBe(180);
    expect(summary.totalImpressions).toBe(42000);
    expect(summary.gscClicksTrendPct).toBe(20);
  });
});

describe("buildOfficeSeoIssueBreakdown", () => {
  it("counts recommendations by severity", () => {
    const breakdown = buildOfficeSeoIssueBreakdown({
      gsc_import_snapshot: [],
      optimization: {
        page_health_table: [],
        recommendations: [
          { id: "1", slug: "a", severity: "critical", title: "Fix", detail: null },
          { id: "2", slug: "b", severity: "warning", title: "Warn", detail: null },
          { id: "3", slug: "c", severity: "info", title: "Tip", detail: null },
        ],
      },
    });
    expect(breakdown.critical).toBe(1);
    expect(breakdown.warnings).toBe(1);
    expect(breakdown.opportunities).toBe(1);
  });
});

describe("formatRecommendationDetail", () => {
  it("formats engine detail objects", () => {
    expect(
      formatRecommendationDetail({
        score: 42,
        band: "needs_improvement",
        ctr_component: 10,
        scroll_component: 20,
        cta_component: 12,
      }),
    ).toContain("CTR 10 pts");
  });
});

describe("mergeSeoRecommendations", () => {
  it("dedupes DB rows by slug and kind, keeping newest", () => {
    const merged = mergeSeoRecommendations(
      [
        {
          id: "old",
          slug: "sea-point-cleaning-services",
          kind: "low_ctr",
          severity: "warning",
          title: "Old",
          detail: null,
          created_at: "2026-01-01T00:00:00Z",
        },
        {
          id: "new",
          slug: "sea-point-cleaning-services",
          kind: "low_ctr",
          severity: "warning",
          title: "New",
          detail: null,
          created_at: "2026-02-01T00:00:00Z",
        },
      ],
      [],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("new");
    expect(merged[0]?.title).toBe("New");
  });

  it("prefers live engine output over stale DB rows", () => {
    const merged = mergeSeoRecommendations(
      [
        {
          id: "db-1",
          slug: "camps-bay-cleaning-services",
          kind: "scroll_depth",
          severity: "critical",
          title: "Stale",
          detail: null,
          created_at: "2026-03-01T00:00:00Z",
        },
      ],
      [
        {
          id: "engine-1",
          slug: "camps-bay-cleaning-services",
          kind: "scroll_depth",
          severity: "warning",
          title: "Fresh",
          detail: null,
        },
      ],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("engine-1");
    expect(merged[0]?.title).toBe("Fresh");
  });

  it("builds stable dedupe keys", () => {
    expect(
      recommendationDedupeKey({ slug: "a-cleaning-services", kind: "low_ctr" }),
    ).toBe("a-cleaning-services|low_ctr");
    expect(recommendationDedupeKey({ slug: null, title: "Global tip" })).toBe("_global|Global tip");
  });
});

describe("buildOfficeSeoRecommendationRows", () => {
  it("filters recommendations by severity", () => {
    const payload = {
      gsc_import_snapshot: [],
      optimization: {
        page_health_table: [],
        recommendations: [
          { id: "1", slug: "a", severity: "critical", title: "Fix", detail: null },
          { id: "2", slug: "b", severity: "warning", title: "Warn", detail: null },
        ],
      },
    };
    expect(buildOfficeSeoRecommendationRows(payload, "critical")).toHaveLength(1);
    expect(buildOfficeSeoRecommendationRows(payload, "all")).toHaveLength(2);
  });
});
