import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CAPE_TOWN_LOCATIONS } from "@/lib/seo/capeTownLocations";
import { LOCATION_SEO_PAGES } from "@/lib/seo/capeTownSeoPages";
import { buildDynamicLocationFaqs } from "@/lib/seo/location-dynamic-faqs";
import { buildPeopleAlsoAskFaqs, mergeLocationFaqs } from "@/lib/seo/location-paa-faqs";
import {
  getCanonicalLocationPricingAnswer,
  getLocationPricingFaqRange,
} from "@/lib/seo/location-pricing";

function location(slug: string) {
  const row = CAPE_TOWN_LOCATIONS.find((item) => item.slug === slug);
  if (!row) throw new Error(`Missing test location: ${slug}`);
  return row;
}

function countIntent(items: Array<{ q: string }>, pattern: RegExp): number {
  return items.filter((item) => pattern.test(item.q.toLowerCase())).length;
}

describe("SEO-E2E-02 location quality control", () => {
  it("deduplicates semantically equivalent pricing, supplies, and availability FAQs", () => {
    const row = location("rondebosch-cleaning-services");
    const merged = mergeLocationFaqs(
      buildPeopleAlsoAskFaqs(row),
      buildDynamicLocationFaqs(row),
    );

    expect(countIntent(merged, /how much.*(cleaner|cleaning).*cost/)).toBe(1);
    expect(countIntent(merged, /(bring|provide).*suppl|suppl.*(bring|provide)/)).toBe(1);
    expect(countIntent(merged, /same-day|how soon.*book|availability/)).toBe(1);
  });


  it("deduplicates a high-tier prepended pricing FAQ against the PAA pricing FAQ", () => {
    const row = location("claremont-cleaning-services");
    const primary = [
      {
        q: `How much does cleaning cost in ${row.name}?`,
        a: getCanonicalLocationPricingAnswer(row),
      },
      ...buildPeopleAlsoAskFaqs(row),
    ];
    const merged = mergeLocationFaqs(primary, buildDynamicLocationFaqs(row));

    expect(countIntent(merged, /how much.*(cleaner|cleaning).*cost/)).toBe(1);
    expect(merged.find((item) => /how much.*cost/i.test(item.q))?.a).toBe(
      getCanonicalLocationPricingAnswer(row),
    );
  });

  it("uses one canonical pricing answer across PAA and dynamic FAQ sources", () => {
    const row = location("rondebosch-cleaning-services");
    const expected = getCanonicalLocationPricingAnswer(row);
    const paaCost = buildPeopleAlsoAskFaqs(row).find((item) =>
      /how much.*cost/i.test(item.q),
    );
    const dynamicCost = buildDynamicLocationFaqs(row).find((item) =>
      /how much.*cost/i.test(item.q),
    );

    expect(paaCost?.a).toBe(expected);
    expect(dynamicCost?.a).toContain(expected);
    expect(expected).toContain(getLocationPricingFaqRange(row));
  });

  it("removes the stale Claremont hard-coded price override", () => {
    const seo = LOCATION_SEO_PAGES["claremont-cleaning-services"];
    expect(seo.rankingCostFaqAnswer).toBeUndefined();
    expect(seo.rankingPricingParagraph).toBeUndefined();
    expect(getCanonicalLocationPricingAnswer(location("claremont-cleaning-services"))).toContain(
      "R400–R750",
    );
  });

  it("suppresses generic repeated modules on high-tier hubs while preserving local-data modules", () => {
    const src = readFileSync(
      join(process.cwd(), "components/seo/ProgrammaticLocationCleaningPage.tsx"),
      "utf8",
    );

    expect(src).not.toContain("What type of cleaning service do you need?");
    expect(src).toContain('rankingResolved?.tier !== "high" ? <LocationHubAuthoritySection');
    expect(src).toContain('rankingResolved?.tier !== "high" ? <LocationHubComparisonSection');
    expect(src).toContain('rankingResolved?.tier !== "high" ? <LocationHubSessionDepth');
    expect(src).toContain("!rankingResolved?.active ? (");
    expect(src).toContain("<LocationHubQueryExpansion");
    expect(src).toContain("!geoHints ? <LocationHubEntityStack");
    expect(src).toContain("<LocationHubServiceDemandSection");
    expect(src).toContain("Landmarks & local geography");
    expect(src).toContain("Homes & lifestyle in {location.name}");
  });
});
