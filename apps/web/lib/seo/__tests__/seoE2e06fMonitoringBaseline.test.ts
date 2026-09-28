import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCapeTownServiceMetadata,
  buildLocationSeoMetadata,
  CAPE_TOWN_SERVICE_SEO,
  LOCATION_SEO_PAGES,
} from "@/lib/seo/capeTownSeoPages";
import { CAPE_TOWN_LOCATIONS } from "@/lib/seo/capeTownLocations";
import { buildMarketingSitemapEntries } from "@/lib/seo/buildMarketingSitemapEntries";
import {
  CLEANING_PRICES_CAPE_TOWN_PATH,
  cleaningPricesHubCanonicalUrl,
} from "@/lib/seo/marketingCleaningPricesHubMeta";
import {
  SEO_E2E_06F_RECHECK_DAYS,
  SEO_E2E_06F_TARGETS,
} from "@/lib/seo/seoE2e06fMonitoring";
import { isSeoRebuildGonePath } from "@/lib/seo/seoRebuildPhase1";
import { LIVE_INTERNAL_LINK_SEED_PATHS } from "@/lib/seo/liveSeoCrawl";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";

const SERVICE_PATHS = [
  "/services/deep-cleaning-cape-town",
  "/services/carpet-cleaning-cape-town",
] as const;

const LOCATION_PATHS = SEO_E2E_06F_TARGETS
  .filter((target) => target.group === "location")
  .map((target) => target.path);

function locationRowForPath(path: string) {
  const slug = path.replace(/^\/locations\//, "");
  const row = CAPE_TOWN_LOCATIONS.find((location) => location.slug === slug);
  if (!row) throw new Error(`Missing location route for ${path}`);
  return row;
}

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

  it("forces every monitoring target through the PR-build 200-status crawl", () => {
    for (const target of SEO_E2E_06F_TARGETS) {
      expect(LIVE_INTERNAL_LINK_SEED_PATHS).toContain(target.path);
    }
  });

  it("asserts self-canonical index,follow metadata for service targets", () => {
    for (const path of SERVICE_PATHS) {
      const block = Object.values(CAPE_TOWN_SERVICE_SEO).find((candidate) => candidate.path === path);
      expect(block, path).toBeTruthy();
      const meta = buildCapeTownServiceMetadata(block!);
      expect(meta.robots).toEqual(SEO_INDEX_FOLLOW);
      expect(meta.alternates?.canonical).toBe(`https://shalean.co.za${path}`);
    }
  });

  it("asserts self-canonical index,follow metadata for location targets", () => {
    for (const path of LOCATION_PATHS) {
      const row = locationRowForPath(path);
      const block = LOCATION_SEO_PAGES[row.slug];
      expect(block?.path).toBe(path);
      const meta = buildLocationSeoMetadata(block, row);
      expect(meta.robots).toEqual(SEO_INDEX_FOLLOW);
      expect(meta.alternates?.canonical).toBe(`https://shalean.co.za${path}`);
    }
  });

  it("protects Cleaning Prices route, canonical, and robots metadata", () => {
    expect(CLEANING_PRICES_CAPE_TOWN_PATH).toBe("/cleaning-prices-cape-town");
    expect(cleaningPricesHubCanonicalUrl()).toBe(
      "https://shalean.co.za/cleaning-prices-cape-town",
    );

    const pageSource = readFileSync(
      join(process.cwd(), "app/(marketing)/cleaning-prices-cape-town/page.tsx"),
      "utf8",
    );
    expect(pageSource).toContain('import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots"');
    expect(pageSource).toContain("robots: SEO_INDEX_FOLLOW");
    expect(pageSource).toContain("alternates: { canonical: CANONICAL }");
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
