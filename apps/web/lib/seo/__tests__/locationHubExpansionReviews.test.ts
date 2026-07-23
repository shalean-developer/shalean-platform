import { describe, expect, it } from "vitest";
import { buildLocationHubJsonLd } from "@/lib/seo/structured-data";
import {
  LOCATION_HUB_EXPANSION_JUL_2026_SLUGS,
  shouldRenderIllustrativeLocationReviews,
} from "@/lib/seo/locationHubExpansion";
import { CAPE_TOWN_LOCATIONS } from "@/lib/seo/capeTownLocations";

describe("location hub expansion review gating", () => {
  it("suppresses illustrative review snippets on all 20 Jul-2026 expansion hubs", () => {
    expect(LOCATION_HUB_EXPANSION_JUL_2026_SLUGS).toHaveLength(20);
    for (const slug of LOCATION_HUB_EXPANSION_JUL_2026_SLUGS) {
      expect(shouldRenderIllustrativeLocationReviews(slug)).toBe(false);
    }
  });

  it("keeps illustrative review snippets enabled on pre-expansion hubs", () => {
    expect(shouldRenderIllustrativeLocationReviews("sea-point-cleaning-services")).toBe(true);
    expect(shouldRenderIllustrativeLocationReviews("claremont-cleaning-services")).toBe(true);
    expect(shouldRenderIllustrativeLocationReviews("rosebank-cleaning-services")).toBe(true);
  });

  it("does not emit Review or testimonial schema nodes for expansion hub JSON-LD", () => {
    for (const slug of LOCATION_HUB_EXPANSION_JUL_2026_SLUGS) {
      const location = CAPE_TOWN_LOCATIONS.find((r) => r.slug === slug);
      expect(location).toBeTruthy();
      const jsonLd = buildLocationHubJsonLd({
        pageUrl: `https://shalean.co.za/locations/${slug}`,
        locationsIndexUrl: "https://shalean.co.za/locations",
        siteOrigin: "https://shalean.co.za",
        h1: `${location!.name} cleaning services`,
        metaDescription: `Cleaning in ${location!.name} with clear online scope.`,
        location: location!,
        faqs: [{ q: `How do I book in ${location!.name}?`, a: "Book online with rooms and extras selected." }],
        nearbyPlaceNames: [{ name: "Nearby" }],
      });
      const blob = JSON.stringify(jsonLd);
      expect(blob).not.toMatch(/"@type":"Review"/);
      expect(blob).not.toMatch(/"@type":"Testimonial"/);
      // AggregateRating on LocalBusiness is Google Business SoT — not illustrative suburb quotes.
      expect(blob).toContain('"@type":"AggregateRating"');
      expect(blob).not.toContain("illustrative");
      expect(blob).not.toContain("Homeowner ·");
    }
  });
});
