import { describe, expect, it } from "vitest";
import { LOCATION_SEO_PAGES } from "@/lib/seo/capeTownSeoPages";
import { resolveLocationRankingSections } from "@/lib/seo/resolve-location-ranking-sections";

const RECOVERY_SLUGS = [
  "hout-bay-cleaning-services",
  "plumstead-cleaning-services",
  "rosebank-cleaning-services",
  "rondebosch-east-cleaning-services",
] as const;

describe("SEO-E2E-06D location decline recovery", () => {
  it("keeps Claremont as the existing high-tier comparison hub", () => {
    const claremont = LOCATION_SEO_PAGES["claremont-cleaning-services"];
    expect(claremont.tier).toBe("high");
    const resolved = resolveLocationRankingSections(claremont);
    expect(resolved.useRankingHero).toBe(true);
    expect(resolved.pricing).toBe(true);
    expect(resolved.serviceList).toBe(true);
    expect(resolved.midInternalLinks).toBe(true);
  });

  it("promotes the genuine low-depth decline hubs to medium without replacing their handcrafted intros", () => {
    for (const slug of [
      "hout-bay-cleaning-services",
      "rosebank-cleaning-services",
      "rondebosch-east-cleaning-services",
    ] as const) {
      const page = LOCATION_SEO_PAGES[slug];
      expect(page.tier).toBe("medium");
      expect(page.intro.length).toBeGreaterThanOrEqual(3);
      expect(page.rankingHeroIntro).toBeUndefined();

      const resolved = resolveLocationRankingSections(page);
      expect(resolved.active).toBe(true);
      expect(resolved.useRankingHero).toBe(false);
      expect(resolved.pricing).toBe(true);
      expect(resolved.nearMeParagraph).toBe(true);
      expect(resolved.serviceList).toBe(true);
      expect(resolved.midInternalLinks).toBe(true);
    }
  });

  it("gives each recovery hub local pricing context and nearby authority links", () => {
    for (const slug of RECOVERY_SLUGS) {
      const page = LOCATION_SEO_PAGES[slug];
      expect(page.rankingPricingParagraph?.length ?? 0).toBeGreaterThan(100);
      expect(page.rankingMidNearbySlugs?.length).toBe(2);
      expect(new Set(page.rankingMidNearbySlugs).size).toBe(2);
    }
  });

  it("keeps Hout Bay pricing copy aligned with actual quote inputs", () => {
    const copy =
      LOCATION_SEO_PAGES["hout-bay-cleaning-services"].rankingPricingParagraph?.toLowerCase() ?? "";

    expect(copy).toContain("bedrooms");
    expect(copy).toContain("bathrooms");
    expect(copy).toContain("price-affecting extras");
    expect(copy).toContain("do not change the locked quote");
    expect(copy).not.toContain("access time");
    expect(copy).not.toContain("linen work");
  });

  it("keeps canonical location ownership unchanged", () => {
    expect(LOCATION_SEO_PAGES["hout-bay-cleaning-services"].path).toBe(
      "/locations/hout-bay-cleaning-services",
    );
    expect(LOCATION_SEO_PAGES["claremont-cleaning-services"].path).toBe(
      "/locations/claremont-cleaning-services",
    );
    expect(LOCATION_SEO_PAGES["plumstead-cleaning-services"].path).toBe(
      "/locations/plumstead-cleaning-services",
    );
    expect(LOCATION_SEO_PAGES["rosebank-cleaning-services"].path).toBe(
      "/locations/rosebank-cleaning-services",
    );
    expect(LOCATION_SEO_PAGES["rondebosch-east-cleaning-services"].path).toBe(
      "/locations/rondebosch-east-cleaning-services",
    );
  });

  it("does not promote the already-strong Claremont page again or force all five into one template", () => {
    const claremont = LOCATION_SEO_PAGES["claremont-cleaning-services"];
    const plumstead = LOCATION_SEO_PAGES["plumstead-cleaning-services"];

    expect(claremont.tier).toBe("high");
    expect(plumstead.tier).toBe("medium");
    expect(claremont.rankingHeroIntro?.length ?? 0).toBeGreaterThan(0);
    expect(plumstead.rankingHeroIntro).toBeUndefined();

    const pricingCopy = RECOVERY_SLUGS.map(
      (slug) => LOCATION_SEO_PAGES[slug].rankingPricingParagraph,
    );
    expect(new Set(pricingCopy).size).toBe(RECOVERY_SLUGS.length);
  });
});
