import { describe, expect, it } from "vitest";
import {
  PUBLIC_LEGACY_REDIRECT_ROBOTS_PATHS,
  isSeoRebuildCoreSitemapPath,
  isSeoRebuildGonePath,
  SEO_REBUILD_PHASE,
  SEO_REBUILD_SITEMAP_CONTENT_PATHS,
  SEO_REBUILD_SITEMAP_CORE_PATHS,
  SEO_REBUILD_SUPPRESS_LOCATION_HUB_LINKS,
  seoRobotsAllowPaths,
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

  it("marks only true gone leftovers (not public redirect sources)", () => {
    expect(isSeoRebuildGonePath("/growth/local")).toBe(true);
    expect(isSeoRebuildGonePath("/location")).toBe(true);
    expect(isSeoRebuildGonePath("/johannesburg/cleaning-services/sandton")).toBe(true);
    expect(isSeoRebuildGonePath("/cleaning-prices-cape-town")).toBe(false);
    expect(isSeoRebuildGonePath("/cleaning-services-cape-town")).toBe(false);
    expect(isSeoRebuildGonePath("/growth/local/deep-cleaning/sea-point")).toBe(false);
    expect(isSeoRebuildGonePath("/location/cape-town/claremont")).toBe(false);
    expect(isSeoRebuildGonePath("/deep-cleaning/sea-point")).toBe(false);
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

  it("does not Disallow public legacy redirect paths", () => {
    const disallow = seoRobotsDisallowPaths();
    for (const path of PUBLIC_LEGACY_REDIRECT_ROBOTS_PATHS) {
      expect(disallow).not.toContain(path);
    }
    expect(disallow).toContain("/admin");
    expect(disallow).toContain("/office");
    expect(disallow).toContain("/api");
    expect(disallow).toContain("/cleaner/");
    expect(disallow).not.toContain("/cleaner");
    expect(disallow).toContain("/account");
    expect(disallow).toContain("/login");
  });

  it("allows only the end-anchored cleaner apply landing exception", () => {
    expect(seoRobotsAllowPaths()).toEqual(["/", "/cleaner/apply$"]);
  });
});
