import { describe, expect, it } from "vitest";
import {
  buildCatalogGscRows,
  hubSlugFromGscPageUrl,
  mergeGscLocationMetaRows,
  normalizeGscCtrValue,
  parseGscPerformanceCsv,
} from "@/lib/seo/gsc-page-import";
import { getAllProgrammaticLocationSlugs } from "@/lib/seo/locations";

describe("hubSlugFromGscPageUrl", () => {
  it("extracts slug from location hub URLs", () => {
    expect(hubSlugFromGscPageUrl("https://shalean.co.za/locations/sea-point-cleaning-services")).toBe(
      "sea-point-cleaning-services",
    );
    expect(hubSlugFromGscPageUrl("/locations/claremont-cleaning-services")).toBe("claremont-cleaning-services");
  });
});

describe("normalizeGscCtrValue", () => {
  it("accepts decimal and percent forms", () => {
    expect(normalizeGscCtrValue(0.042)).toBe(0.042);
    expect(normalizeGscCtrValue(4.2)).toBe(0.042);
    expect(normalizeGscCtrValue("4.2%")).toBe(0.042);
  });
});

describe("parseGscPerformanceCsv", () => {
  it("parses GSC page export rows into hub slugs", () => {
    const csv = `Search Console report
Page,Clicks,Impressions,CTR,Position
https://shalean.co.za/locations/sea-point-cleaning-services,52,1240,4.2%,6.8
https://shalean.co.za/locations/claremont-cleaning-services,41,890,4.6%,5.2
https://shalean.co.za/blog/some-post,10,100,10%,3.0`;

    const rows = parseGscPerformanceCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      slug: "sea-point-cleaning-services",
      clicks: 52,
      impressions: 1240,
      ctr: 0.042,
      avg_position: 6.8,
    });
  });
});

describe("buildCatalogGscRows", () => {
  it("includes every programmatic hub slug", () => {
    const rows = buildCatalogGscRows();
    const slugs = getAllProgrammaticLocationSlugs();
    expect(rows).toHaveLength(slugs.length);
    expect(rows.map((r) => r.slug).sort()).toEqual([...slugs].sort());
  });

  it("preserves known sample metrics", () => {
    const row = buildCatalogGscRows().find((r) => r.slug === "sea-point-cleaning-services");
    expect(row).toMatchObject({ impressions: 1240, clicks: 52, ctr: 0.042, avg_position: 6.8 });
  });

  it("merges CSV rows over catalog defaults", () => {
    const csv = parseGscPerformanceCsv(`Page,Clicks,Impressions,CTR,Position
https://shalean.co.za/locations/kenilworth-cleaning-services,99,2000,5%,4.1`);
    const rows = buildCatalogGscRows(mergeGscLocationMetaRows(csv));
    const kenilworth = rows.find((r) => r.slug === "kenilworth-cleaning-services");
    expect(kenilworth).toMatchObject({ impressions: 2000, clicks: 99, ctr: 0.05, avg_position: 4.1 });
  });
});
