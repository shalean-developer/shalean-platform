import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  CAPE_TOWN_SEO_SERVICE_SLUGS,
  CAPE_TOWN_SERVICE_SEO,
  buildCapeTownServiceMetadata,
} from "@/lib/seo/capeTownSeoPages";
import { buildMarketingSitemapEntries } from "@/lib/seo/buildMarketingSitemapEntries";
import { SEO_REBUILD_SITEMAP_CORE_PATHS, isSeoRebuildGonePath } from "@/lib/seo/seoRebuildPhase1";
import { resolveLegacyMarketingExactRedirect } from "@/lib/seo/legacyMarketingRedirectMatrix";
import { resolveLegacySingularLocation, resolveLegacyGrowthLocal } from "@/lib/seo/legacyPhase1EdgeRedirects";
import { absoluteCanonicalUrl, SITE_ORIGIN } from "@/lib/site/canonical";
import { MARKETING_SERVICE_NAV_LINKS } from "@/lib/marketing/marketingServiceNavLinks";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";

const UNINDEXED_REMEDIATION_SLUGS = [
  "deep-cleaning-cape-town",
  "airbnb-cleaning-cape-town",
  "office-cleaning-cape-town",
  "move-out-cleaning-cape-town",
  "window-cleaning-cape-town",
] as const;

describe("SEO-FIX-001/002 service money pages", () => {
  it("uses apex shalean.co.za host for canonicals", () => {
    expect(SITE_ORIGIN).toBe("https://shalean.co.za");
    for (const slug of CAPE_TOWN_SEO_SERVICE_SLUGS) {
      expect(absoluteCanonicalUrl(CAPE_TOWN_SERVICE_SEO[slug].path)).toBe(
        `https://shalean.co.za${CAPE_TOWN_SERVICE_SEO[slug].path}`,
      );
      expect(absoluteCanonicalUrl(CAPE_TOWN_SERVICE_SEO[slug].path)).not.toContain("www.");
    }
  });

  it("emits index,follow metadata with self-referencing canonical for all seven services", () => {
    for (const slug of CAPE_TOWN_SEO_SERVICE_SLUGS) {
      const meta = buildCapeTownServiceMetadata(CAPE_TOWN_SERVICE_SEO[slug]);
      expect(meta.robots).toEqual(SEO_INDEX_FOLLOW);
      expect(meta.alternates?.canonical).toBe(`https://shalean.co.za${CAPE_TOWN_SERVICE_SEO[slug].path}`);
      expect(typeof meta.title).toBe("string");
      expect(String(meta.title).length).toBeGreaterThan(20);
      expect(typeof meta.description).toBe("string");
      expect(String(meta.description).length).toBeGreaterThan(40);
    }
  });

  it("requires unique titles, descriptions, H1s, exclusions, and FAQs on remediation slugs", () => {
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    const h1s = new Set<string>();

    for (const slug of UNINDEXED_REMEDIATION_SLUGS) {
      const block = CAPE_TOWN_SERVICE_SEO[slug];
      expect(block.h1.trim().length).toBeGreaterThan(10);
      expect(block.included.length).toBeGreaterThanOrEqual(4);
      expect(block.exclusions?.length ?? 0).toBeGreaterThanOrEqual(4);
      expect(block.faqs.length).toBeGreaterThanOrEqual(4);
      expect(block.heroImage.alt.trim().length).toBeGreaterThan(10);
      expect(block.explanation.length).toBeGreaterThanOrEqual(2);

      expect(titles.has(block.title)).toBe(false);
      expect(descriptions.has(block.description)).toBe(false);
      expect(h1s.has(block.h1)).toBe(false);
      titles.add(block.title);
      descriptions.add(block.description);
      h1s.add(block.h1);
    }
  });

  it("includes all seven service money pages in the sitemap core set and built sitemap", async () => {
    for (const slug of CAPE_TOWN_SEO_SERVICE_SLUGS) {
      const p = CAPE_TOWN_SERVICE_SEO[slug].path;
      expect(SEO_REBUILD_SITEMAP_CORE_PATHS).toContain(p);
      expect(isSeoRebuildGonePath(p)).toBe(false);
    }

    const entries = await buildMarketingSitemapEntries();
    const paths = entries.map((e) => new URL(e.url).pathname.replace(/\/+$/, "") || "/");
    for (const slug of CAPE_TOWN_SEO_SERVICE_SLUGS) {
      expect(paths).toContain(CAPE_TOWN_SERVICE_SEO[slug].path);
    }
    expect(paths).not.toContain("/details");
    expect(paths).not.toContain("/booking/details");
    expect(paths).not.toContain("/cleaner/apply/form");
    expect(paths).not.toContain("/location");
    expect(paths).not.toContain("/growth/local");
  });

  it("keeps header nav pointing at canonical service destinations including remediation URLs", () => {
    const hrefs = MARKETING_SERVICE_NAV_LINKS.map((l) => l.href);
    for (const slug of UNINDEXED_REMEDIATION_SLUGS) {
      expect(hrefs).toContain(CAPE_TOWN_SERVICE_SEO[slug].path);
    }
    expect(hrefs).toContain("/services");
  });

  it("omits blocked unverified claims from service money-page copy and metadata", () => {
    const blocked = [
      /4,?500\+?\s*homes/i,
      /4\.8\s*★/,
      /129\s*reviews/i,
      /\bvetted\b/i,
      /from\s*r\s*250/i,
      /same-day\s+availability/i,
      /same-day\s+and\s+next-day/i,
      /guaranteed\s+deposit/i,
      /guaranteed\s+same-day/i,
    ];

    for (const slug of CAPE_TOWN_SEO_SERVICE_SLUGS) {
      const block = CAPE_TOWN_SERVICE_SEO[slug];
      const meta = buildCapeTownServiceMetadata(block);
      const corpus = [
        String(meta.title),
        String(meta.description),
        block.title,
        block.description,
        block.h1,
        ...block.explanation,
        ...block.included,
        ...(block.exclusions ?? []).filter((e) => !/^guaranteed\b/i.test(e) && !/^same-day emergency/i.test(e)),
        ...block.benefits.flatMap((b) => [b.title, b.body]),
        ...block.faqs.flatMap((f) => [f.q, f.a]),
      ].join("\n");

      for (const re of blocked) {
        // Exclusions that deny guarantees / same-day emergency remain allowed as negative scope.
        expect(corpus, `${slug} matched ${re}`).not.toMatch(re);
      }
      expect(String(meta.title)).not.toMatch(/PREVIEW|STAGING/i);
      expect(String(meta.title)).not.toMatch(/from\s*r\s*\d+/i);
    }
  });
});

describe("SEO-FIX-001 location disposition rules", () => {
  it("maps singular /location/cape-town/{hub} to /locations/{hub}-cleaning-services", () => {
    expect(resolveLegacySingularLocation("cape-town", "sea-point")).toEqual({
      type: "redirect",
      pathname: "/locations/sea-point-cleaning-services",
    });
  });

  it("maps /growth/local/{intent}/{hub} to locations spine", () => {
    expect(resolveLegacyGrowthLocal("/growth/local/deep-cleaning/sea-point")).toEqual({
      type: "redirect",
      pathname: "/locations/sea-point-cleaning-services",
    });
  });

  it("410s bare /location and /growth/local", () => {
    expect(isSeoRebuildGonePath("/location")).toBe(true);
    expect(isSeoRebuildGonePath("/growth/local")).toBe(true);
  });
});

describe("SEO-FIX-001 transactional / private route hygiene", () => {
  it("redirects legacy /details to /book (not an SEO landing)", () => {
    expect(resolveLegacyMarketingExactRedirect("/details")).toEqual({
      source: "/details",
      destination: "/book",
      status: 308,
    });
  });

  it("keeps cleaner apply form noindex,nofollow in source", () => {
    const formPath = path.join(process.cwd(), "app/cleaner/apply/form/page.tsx");
    const src = readFileSync(formPath, "utf8");
    expect(src).toMatch(/index:\s*false/);
    expect(src).toMatch(/follow:\s*false/);
  });
});
