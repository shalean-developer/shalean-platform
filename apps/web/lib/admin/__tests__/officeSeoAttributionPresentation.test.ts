import { describe, expect, it } from "vitest";
import {
  buildAttributionChannelBars,
  findOrganicAttributionRow,
  isPaidAttributionMedium,
  seoAttributionChannelLabel,
} from "@/lib/admin/officeSeoAttributionPresentation";

describe("isPaidAttributionMedium", () => {
  it("recognizes common paid media", () => {
    expect(isPaidAttributionMedium("cpc")).toBe(true);
    expect(isPaidAttributionMedium("pmax")).toBe(true);
    expect(isPaidAttributionMedium("paid_social")).toBe(true);
    expect(isPaidAttributionMedium("organic")).toBe(false);
    expect(isPaidAttributionMedium("social")).toBe(false);
    expect(isPaidAttributionMedium("—")).toBe(false);
  });
});

describe("seoAttributionChannelLabel", () => {
  it("maps organic bucket", () => {
    expect(seoAttributionChannelLabel("(organic / no UTM)")).toBe("Organic SEO");
  });

  it("labels Google as Ads only for paid mediums", () => {
    expect(seoAttributionChannelLabel("google", "cpc")).toBe("Google Ads");
    expect(seoAttributionChannelLabel("google", "pmax")).toBe("Google Ads");
    expect(seoAttributionChannelLabel("google", "organic")).toBe("Organic SEO");
    expect(seoAttributionChannelLabel("google", "—")).toBe("Google Organic");
  });

  it("labels Facebook as Ads only for paid mediums", () => {
    expect(seoAttributionChannelLabel("facebook", "paid_social")).toBe("Facebook Ads");
    expect(seoAttributionChannelLabel("facebook", "cpc")).toBe("Facebook Ads");
    expect(seoAttributionChannelLabel("facebook", "social")).toBe("Facebook Organic");
    expect(seoAttributionChannelLabel("fb", "referral")).toBe("Facebook Organic");
  });

  it("keeps Google Business Profile out of Google Ads", () => {
    expect(seoAttributionChannelLabel("gbp:maps", "—")).toBe("Google Business Profile");
    expect(seoAttributionChannelLabel("google_business_profile", "organic")).toBe("Google Business Profile");
  });
});

describe("buildAttributionChannelBars", () => {
  it("aggregates paid Google rows into Google Ads and keeps organic separate", () => {
    const bars = buildAttributionChannelBars([
      { source: "google", medium: "cpc", key: "a", quoted: 10, completed: 2, conversionPct: 20 },
      { source: "google", medium: "pmax", key: "b", quoted: 5, completed: 1, conversionPct: 20 },
      { source: "google", medium: "organic", key: "d", quoted: 4, completed: 1, conversionPct: 25 },
      { source: "(organic / no UTM)", medium: "—", key: "c", quoted: 8, completed: 3, conversionPct: 37.5 },
      { source: "facebook", medium: "social", key: "e", quoted: 3, completed: 1, conversionPct: 33 },
      { source: "facebook", medium: "paid_social", key: "f", quoted: 6, completed: 2, conversionPct: 33 },
    ]);

    expect(bars.find((b) => b.label === "Google Ads")).toMatchObject({ bookings: 3, starts: 15 });
    expect(bars.find((b) => b.label === "Organic SEO")).toMatchObject({ bookings: 4, starts: 12 });
    expect(bars.find((b) => b.label === "Facebook Ads")).toMatchObject({ bookings: 2, starts: 6 });
    expect(bars.find((b) => b.label === "Facebook Organic")).toMatchObject({ bookings: 1, starts: 3 });
    expect(bars[0]?.label).toBe("Organic SEO");
  });
});

describe("findOrganicAttributionRow", () => {
  it("finds organic source row", () => {
    const row = findOrganicAttributionRow([
      { source: "(organic / no UTM)", medium: "—", key: "x", quoted: 1, completed: 0, conversionPct: 0 },
    ]);
    expect(row?.quoted).toBe(1);
  });
});
