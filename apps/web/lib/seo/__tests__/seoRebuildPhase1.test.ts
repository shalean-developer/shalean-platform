import { describe, expect, it } from "vitest";
import {
  isSeoRebuildCoreSitemapPath,
  isSeoRebuildGonePath,
  SEO_REBUILD_PHASE,
  SEO_REBUILD_SITEMAP_CONTENT_PATHS,
  SEO_REBUILD_SITEMAP_CORE_PATHS,
  SEO_REBUILD_SUPPRESS_LOCATION_HUB_LINKS,
  seoRobotsDisallowPaths,
} from "@/lib/seo/seoRebuildPhase1";

describe("seoRebuildPhase1", () => {
  it("runs phase 2 by default", () => {
    expect(SEO_REBUILD_PHASE).toBeGreaterThanOrEqual(2);
    expect(SEO_REBUILD_SUPPRESS_LOCATION_HUB_LINKS).toBe(false);
  });

  it("lists core sitemap paths including window cleaning", () => {
    expect(SEO_REBUILD_SITEMAP_CORE_PATHS).toContain("/services/standard-cleaning-cape-town");
    expect(SEO_REBUILD_SITEMAP_CORE_PATHS).toContain("/services/window-cleaning-cape-town");
    expect(SEO_REBUILD_SITEMAP_CORE_PATHS.length).toBe(11);
  });

  it("lists content sitemap paths", () => {
    expect(SEO_REBUILD_SITEMAP_CONTENT_PATHS).toContain("/blog");
    expect(SEO_REBUILD_SITEMAP_CONTENT_PATHS).toContain("/faq");
    expect(SEO_REBUILD_SITEMAP_CONTENT_PATHS).toContain("/reviews");
  });

  it("marks permanently retired legacy URLs as gone", () => {
    expect(isSeoRebuildGonePath("/growth/local/cleaning-services/sea-point")).toBe(true);
    expect(isSeoRebuildGonePath("/location/cape-town/claremont")).toBe(true);
    expect(isSeoRebuildGonePath("/deep-cleaning/sea-point")).toBe(true);
    expect(isSeoRebuildGonePath("/cleaning-prices-cape-town")).toBe(true);
    expect(isSeoRebuildGonePath("/maid-services-cape-town")).toBe(true);
  });

  it("keeps phase-2 location hubs and window cleaning live", () => {
    expect(isSeoRebuildGonePath("/locations/sea-point-cleaning-services")).toBe(false);
    expect(isSeoRebuildGonePath("/locations")).toBe(false);
    expect(isSeoRebuildGonePath("/services/window-cleaning-cape-town")).toBe(false);
  });

  it("keeps core marketing URLs live", () => {
    expect(isSeoRebuildGonePath("/")).toBe(false);
    expect(isSeoRebuildGonePath("/services/deep-cleaning-cape-town")).toBe(false);
    expect(isSeoRebuildGonePath("/about")).toBe(false);
    expect(isSeoRebuildCoreSitemapPath("/contact")).toBe(true);
  });

  it("allows location hubs in robots.txt during phase 2", () => {
    expect(seoRobotsDisallowPaths()).not.toContain("/locations/");
  });
});
