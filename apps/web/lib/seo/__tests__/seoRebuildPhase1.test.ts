import { describe, expect, it } from "vitest";
import {
  isSeoRebuildCoreSitemapPath,
  isSeoRebuildGonePath,
  SEO_REBUILD_SITEMAP_CORE_PATHS,
} from "@/lib/seo/seoRebuildPhase1";

describe("seoRebuildPhase1", () => {
  it("lists core sitemap paths", () => {
    expect(SEO_REBUILD_SITEMAP_CORE_PATHS).toContain("/services/standard-cleaning-cape-town");
    expect(SEO_REBUILD_SITEMAP_CORE_PATHS.length).toBe(10);
  });

  it("marks legacy growth and location URLs as gone", () => {
    expect(isSeoRebuildGonePath("/growth/local/cleaning-services/sea-point")).toBe(true);
    expect(isSeoRebuildGonePath("/location/cape-town/claremont")).toBe(true);
    expect(isSeoRebuildGonePath("/locations/sea-point-cleaning-services")).toBe(true);
    expect(isSeoRebuildGonePath("/deep-cleaning/sea-point")).toBe(true);
  });

  it("keeps core marketing URLs live", () => {
    expect(isSeoRebuildGonePath("/")).toBe(false);
    expect(isSeoRebuildGonePath("/services/deep-cleaning-cape-town")).toBe(false);
    expect(isSeoRebuildGonePath("/about")).toBe(false);
    expect(isSeoRebuildCoreSitemapPath("/contact")).toBe(true);
  });
});
