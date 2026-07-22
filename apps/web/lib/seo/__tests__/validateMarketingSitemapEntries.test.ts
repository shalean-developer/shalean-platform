import { describe, expect, it } from "vitest";
import { buildMarketingSitemapEntries } from "@/lib/seo/buildMarketingSitemapEntries";
import {
  assertPublicRedirectsNotBlockedByRobots,
  validateMarketingSitemapEntries,
} from "@/lib/seo/validateMarketingSitemapEntries";
import { legacyMarketingRedirectSourcePaths } from "@/lib/seo/legacyMarketingRedirectMatrix";
import { SITE_ORIGIN } from "@/lib/site/canonical";

describe("validateMarketingSitemapEntries", () => {
  it("accepts the generated marketing sitemap", async () => {
    const entries = await buildMarketingSitemapEntries();
    const issues = validateMarketingSitemapEntries(entries);
    expect(issues).toEqual([]);
  });

  it("includes published file-based blog articles", async () => {
    const entries = await buildMarketingSitemapEntries();
    const blogPaths = entries
      .map((e) => new URL(e.url).pathname)
      .filter((p) => p.startsWith("/blog/"));
    expect(blogPaths.length).toBeGreaterThan(10);
    expect(blogPaths.some((p) => p.includes("how-much-does-cleaning-cost-cape-town-2026"))).toBe(
      true,
    );
  });

  it("uses apex SITE_ORIGIN only", async () => {
    expect(SITE_ORIGIN).toBe("https://shalean.co.za");
    const entries = await buildMarketingSitemapEntries();
    for (const e of entries) {
      expect(e.url.startsWith("https://shalean.co.za")).toBe(true);
      expect(e.url.includes("www.")).toBe(false);
      expect(e.url.includes("shalean.com")).toBe(false);
    }
  });

  it("excludes redirect sources and does not use a single fabricated lastmod for all URLs", async () => {
    const entries = await buildMarketingSitemapEntries();
    const paths = new Set(entries.map((e) => new URL(e.url).pathname.replace(/\/+$/, "") || "/"));
    for (const source of legacyMarketingRedirectSourcePaths()) {
      expect(paths.has(source)).toBe(false);
    }
    const lastmods = new Set(
      entries.map((e) => (e.lastModified instanceof Date ? e.lastModified.toISOString() : String(e.lastModified))),
    );
    expect(lastmods.size).toBeGreaterThan(1);
    expect([...lastmods].every((d) => d.startsWith("2026-04-01"))).toBe(false);
  });

  it("rejects www and .com hosts", () => {
    const issues = validateMarketingSitemapEntries([
      { url: "https://www.shalean.co.za/", lastModified: new Date("2026-01-01") },
      { url: "https://shalean.com/services", lastModified: new Date("2026-01-01") },
    ]);
    expect(issues.some((i) => i.code === "www_host")).toBe(true);
    expect(issues.some((i) => i.code === "com_host")).toBe(true);
  });

  it("keeps public redirect URLs crawlable in robots", () => {
    expect(assertPublicRedirectsNotBlockedByRobots()).toEqual([]);
  });
});
