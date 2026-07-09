import { describe, expect, it } from "vitest";
import { mapGscQueryPageRowsToLocationQueries } from "@/lib/gsc/sync-location-gsc-queries";

describe("mapGscQueryPageRowsToLocationQueries", () => {
  it("maps query+page rows to hub slugs and aggregates duplicate query+slug pairs", () => {
    const { metrics, skippedUrls } = mapGscQueryPageRowsToLocationQueries([
      {
        query: "cleaning services sea point",
        pageUrl: "https://shalean.co.za/locations/sea-point-cleaning-services",
        clicks: 12,
        impressions: 400,
        ctr: 0.03,
        avgPosition: 7.2,
      },
      {
        query: "cleaning services sea point",
        pageUrl: "https://shalean.co.za/locations/sea-point-cleaning-services?ref=gsc",
        clicks: 3,
        impressions: 100,
        ctr: 0.03,
        avgPosition: 6.8,
      },
      {
        query: "maids camps bay",
        pageUrl: "https://shalean.co.za/locations/unknown-area-cleaning-services",
        clicks: 1,
        impressions: 20,
        ctr: 0.05,
        avgPosition: 11,
      },
    ]);

    expect(metrics).toHaveLength(1);
    expect(metrics[0]?.query).toBe("cleaning services sea point");
    expect(metrics[0]?.slug).toBe("sea-point-cleaning-services");
    expect(metrics[0]?.clicks).toBe(15);
    expect(metrics[0]?.impressions).toBe(500);
    expect(skippedUrls.some((u) => u.includes("unknown-area"))).toBe(true);
  });
});
