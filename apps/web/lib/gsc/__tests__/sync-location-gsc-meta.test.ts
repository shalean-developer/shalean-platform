import { describe, expect, it } from "vitest";
import { buildGscSyncMetaRow, formatGscDailyChartPoints } from "@/lib/gsc/sync-location-gsc-meta";

describe("formatGscDailyChartPoints", () => {
  it("formats daily rows for sparkline labels", () => {
    const points = formatGscDailyChartPoints([
      { date: "2026-01-03", clicks: 4, impressions: 120 },
      { date: "2026-01-04", clicks: 7, impressions: 200 },
    ]);
    expect(points[0]?.label).toBe("3 Jan");
    expect(points[1]?.value).toBe(7);
  });
});

describe("buildGscSyncMetaRow", () => {
  it("stores period totals and trend pct", () => {
    const row = buildGscSyncMetaRow({
      currentRange: { startDate: "2026-01-01", endDate: "2026-01-31" },
      previousRange: { startDate: "2025-12-01", endDate: "2025-12-31" },
      currentClicks: 18,
      currentImpressions: 31306,
      previousClicks: 15,
      previousImpressions: 28000,
      dailyRows: [{ date: "2026-01-03", clicks: 2, impressions: 40 }],
    });
    expect(row.clicks_trend_pct).toBe(20);
    expect(row.clicks_chart).toHaveLength(1);
  });
});
