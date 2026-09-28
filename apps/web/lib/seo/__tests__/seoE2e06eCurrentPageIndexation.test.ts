import { describe, expect, it } from "vitest";
import {
  buildLocationSeoMetadata,
  LOCATION_SEO_PAGES,
} from "@/lib/seo/capeTownSeoPages";
import { CAPE_TOWN_LOCATIONS } from "@/lib/seo/capeTownLocations";
import { buildMarketingSitemapEntries } from "@/lib/seo/buildMarketingSitemapEntries";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";

const CONSTANTIA = "/locations/constantia-cleaning-services";
const BANTRY = "/locations/bantry-bay-cleaning-services";

function row(slug: string) {
  const hit = CAPE_TOWN_LOCATIONS.find((loc) => loc.slug === slug);
  if (!hit) throw new Error(`Missing location row: ${slug}`);
  return hit;
}

describe("SEO-E2E-06E current-page indexation cleanup", () => {
  it("keeps Constantia and Bantry Bay self-canonical and index,follow", () => {
    for (const slug of ["constantia-cleaning-services", "bantry-bay-cleaning-services"] as const) {
      const block = LOCATION_SEO_PAGES[slug];
      const meta = buildLocationSeoMetadata(block, row(slug));
      expect(meta.robots).toEqual(SEO_INDEX_FOLLOW);
      expect(meta.alternates?.canonical).toBe(`https://shalean.co.za${block.path}`);
    }
  });

  it("keeps both current hubs in the generated sitemap", async () => {
    const entries = await buildMarketingSitemapEntries();
    const paths = entries.map((entry) => new URL(entry.url).pathname.replace(/\/+$/, "") || "/");

    expect(paths).toContain(CONSTANTIA);
    expect(paths).toContain(BANTRY);
  });

  it("leaves the already-strong Constantia content asset unchanged", () => {
    const constantia = LOCATION_SEO_PAGES["constantia-cleaning-services"];
    expect(constantia.path).toBe(CONSTANTIA);
    expect(constantia.tier).toBe("high");
    expect(constantia.hasApartmentFocus).toBe(false);
  });

  it("strengthens Bantry Bay without changing URL ownership", () => {
    const bantry = LOCATION_SEO_PAGES["bantry-bay-cleaning-services"];
    expect(bantry.path).toBe(BANTRY);
    expect(bantry.tier).toBe("medium");
    expect(bantry.hasAirbnbFocus).toBe(true);
    expect(bantry.hasApartmentFocus).toBe(true);
    expect(bantry.rankingPricingParagraph?.toLowerCase()).toContain("price-affecting extras");
    expect(bantry.rankingPricingParagraph?.toLowerCase()).toContain("locked quote");
    expect(bantry.rankingMidNearbySlugs).toEqual([
      "fresnaye-cleaning-services",
      "sea-point-cleaning-services",
    ]);
    expect(bantry.relatedBlogGuide?.href).toBe("/locations/sea-point-cleaning-services");
  });
});
