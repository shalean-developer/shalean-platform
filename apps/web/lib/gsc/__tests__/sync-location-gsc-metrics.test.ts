import { describe, expect, it } from "vitest";
import { mapGscPageRowsToLocationMetrics } from "@/lib/gsc/sync-location-gsc-metrics";

describe("mapGscPageRowsToLocationMetrics", () => {
  it("maps /locations/ URLs to hub slugs and skips unknown paths", () => {
    const { metrics, skippedUrls } = mapGscPageRowsToLocationMetrics([
      {
        pageUrl: "https://shalean.co.za/locations/sea-point-cleaning-services",
        clicks: 52,
        impressions: 1240,
        ctr: 0.042,
        avgPosition: 6.8,
      },
      {
        pageUrl: "https://shalean.co.za/locations/unknown-area-cleaning-services",
        clicks: 1,
        impressions: 10,
        ctr: 0.1,
        avgPosition: 12,
      },
      {
        pageUrl: "https://shalean.co.za/blog/post",
        clicks: 5,
        impressions: 100,
        ctr: 0.05,
        avgPosition: 8,
      },
    ]);

    expect(metrics).toHaveLength(1);
    expect(metrics[0]?.slug).toBe("sea-point-cleaning-services");
    expect(metrics[0]?.clicks).toBe(52);
    expect(skippedUrls.some((u) => u.includes("unknown-area"))).toBe(true);
  });
});
