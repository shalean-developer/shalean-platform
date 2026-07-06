import { describe, expect, it } from "vitest";
import { buildMarketingSitemapEntries } from "@/lib/seo/buildMarketingSitemapEntries";
import {
  SEO_REBUILD_SITEMAP_CONTENT_PATHS,
  SEO_REBUILD_SITEMAP_CORE_PATHS,
} from "@/lib/seo/seoRebuildPhase1";

describe("buildMarketingSitemapEntries", () => {
  it("includes core and content marketing paths", async () => {
    const entries = await buildMarketingSitemapEntries();
    const paths = entries.map((e) => new URL(e.url).pathname.replace(/\/+$/, "") || "/");

    for (const path of SEO_REBUILD_SITEMAP_CORE_PATHS) {
      expect(paths).toContain(path);
    }
    for (const path of SEO_REBUILD_SITEMAP_CONTENT_PATHS) {
      expect(paths).toContain(path);
    }
  });

  it("lists more URLs than core-only phase-1 sitemap", async () => {
    const entries = await buildMarketingSitemapEntries();
    expect(entries.length).toBeGreaterThan(SEO_REBUILD_SITEMAP_CORE_PATHS.length);
  });

  it("includes location hub paths in phase 2", async () => {
    const entries = await buildMarketingSitemapEntries();
    const paths = entries.map((e) => new URL(e.url).pathname.replace(/\/+$/, "") || "/");
    expect(paths).toContain("/locations");
    expect(paths).toContain("/locations/sea-point-cleaning-services");
  });
});
