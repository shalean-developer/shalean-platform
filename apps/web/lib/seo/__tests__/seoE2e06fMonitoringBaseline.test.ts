import { describe, expect, it } from "vitest";
import { buildMarketingSitemapEntries } from "@/lib/seo/buildMarketingSitemapEntries";
import {
  SEO_E2E_06F_RECHECK_DAYS,
  SEO_E2E_06F_TARGETS,
} from "@/lib/seo/seoE2e06fMonitoring";
import { isSeoRebuildGonePath } from "@/lib/seo/seoRebuildPhase1";

describe("SEO-E2E-06F monitoring baseline", () => {
  it("tracks the full closeout target set without duplicates", () => {
    expect(SEO_E2E_06F_TARGETS).toHaveLength(10);
    const paths = SEO_E2E_06F_TARGETS.map((target) => target.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("keeps every monitoring target indexation-eligible in the sitemap", async () => {
    const entries = await buildMarketingSitemapEntries();
    const sitemapPaths = new Set(
      entries.map((entry) => new URL(entry.url).pathname.replace(/\/+$/, "") || "/"),
    );

    for (const target of SEO_E2E_06F_TARGETS) {
      expect(isSeoRebuildGonePath(target.path)).toBe(false);
      expect(sitemapPaths.has(target.path), target.path).toBe(true);
    }
  });

  it("uses a recrawl-first observation window instead of repeated immediate edits", () => {
    expect(SEO_E2E_06F_RECHECK_DAYS).toEqual([7, 21]);
    expect(
      SEO_E2E_06F_TARGETS.filter((target) => target.action === "monitor_only").length,
    ).toBe(9);
  });

  it("limits manual Request Indexing guidance to the corrected Cleaning Prices page", () => {
    const manual = SEO_E2E_06F_TARGETS.filter(
      (target) => target.action === "manual_gsc_request_if_not_indexed",
    );
    expect(manual).toEqual([
      expect.objectContaining({ path: "/cleaning-prices-cape-town", group: "pricing" }),
    ]);
  });
});
