import { describe, expect, it } from "vitest";
import {
  buildAttributionChannelBars,
  findOrganicAttributionRow,
  seoAttributionChannelLabel,
} from "@/lib/admin/officeSeoAttributionPresentation";

describe("seoAttributionChannelLabel", () => {
  it("maps organic bucket", () => {
    expect(seoAttributionChannelLabel("(organic / no UTM)")).toBe("Organic SEO");
  });
});

describe("buildAttributionChannelBars", () => {
  it("aggregates multiple google rows into one channel bar", () => {
    const bars = buildAttributionChannelBars([
      { source: "google", medium: "cpc", key: "a", quoted: 10, completed: 2, conversionPct: 20 },
      { source: "google", medium: "pmax", key: "b", quoted: 5, completed: 1, conversionPct: 20 },
      { source: "(organic / no UTM)", medium: "—", key: "c", quoted: 8, completed: 3, conversionPct: 37.5 },
    ]);

    expect(bars.find((b) => b.label === "Google Ads")).toMatchObject({ bookings: 3, starts: 15 });
    expect(bars.find((b) => b.label === "Organic SEO")).toMatchObject({ bookings: 3, starts: 8 });
    expect(bars[0]?.label).toBe("Google Ads");
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
