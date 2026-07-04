import { describe, expect, it } from "vitest";
import {
  buildOfficeSeoDataGapsSummary,
  buildOfficeSeoKpis,
  buildOfficeSeoPageRows,
  formatRecommendationDetail,
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
