import { describe, expect, it } from "vitest";
import { resolveLegacyGrowthLocal, resolveLegacySingularLocation } from "@/lib/seo/legacyPhase1EdgeRedirects";

describe("resolveLegacySingularLocation", () => {
  it("redirects Cape Town hub suburbs to /locations/*", () => {
    expect(resolveLegacySingularLocation("cape-town", "sea-point")).toEqual({
      type: "redirect",
      pathname: "/locations/sea-point-cleaning-services",
    });
    expect(resolveLegacySingularLocation("Cape Town", "claremont")).toEqual({
      type: "redirect",
      pathname: "/locations/claremont-cleaning-services",
    });
  });

  it("returns gone for unknown Cape Town suburbs", () => {
    expect(resolveLegacySingularLocation("cape-town", "not-a-real-suburb-xyz")).toEqual({ type: "gone" });
  });

  it("redirects Johannesburg SERVICE_LOCATIONS slugs", () => {
    expect(resolveLegacySingularLocation("johannesburg", "sandton")).toEqual({
      type: "redirect",
      pathname: "/johannesburg/cleaning-services/sandton",
    });
  });

  it("returns gone for unknown Johannesburg suburbs", () => {
    expect(resolveLegacySingularLocation("johannesburg", "fake-area")).toEqual({ type: "gone" });
  });

  it("returns gone for Pretoria/Durban (no area routes)", () => {
    expect(resolveLegacySingularLocation("pretoria", "centurion")).toEqual({ type: "gone" });
    expect(resolveLegacySingularLocation("durban", "umhlanga")).toEqual({ type: "gone" });
  });
});

describe("resolveLegacyGrowthLocal", () => {
  it("returns null for unrelated paths", () => {
    expect(resolveLegacyGrowthLocal("/blog/foo")).toBeNull();
    expect(resolveLegacyGrowthLocal("/growth/localshop")).toBeNull();
  });

  it("returns gone for /growth/local only", () => {
    expect(resolveLegacyGrowthLocal("/growth/local")).toEqual({ type: "gone" });
    expect(resolveLegacyGrowthLocal("/growth/local/")).toEqual({ type: "gone" });
  });

  it("redirects two-segment Stage 19 URLs", () => {
    expect(resolveLegacyGrowthLocal("/growth/local/deep-cleaning/sea-point")).toEqual({
      type: "redirect",
      pathname: "/deep-cleaning/sea-point",
    });
  });

  it("redirects single-segment combined intent-suburb", () => {
    expect(resolveLegacyGrowthLocal("/growth/local/deep-cleaning-sea-point")).toEqual({
      type: "redirect",
      pathname: "/deep-cleaning/sea-point",
    });
  });

  it("falls back to service page when Stage 19 row missing (e.g. airbnb editorial suburbs)", () => {
    expect(resolveLegacyGrowthLocal("/growth/local/airbnb-cleaning/sea-point")).toEqual({
      type: "redirect",
      pathname: "/services/airbnb-cleaning-cape-town",
    });
  });

  it("returns gone for unparseable growth local tails", () => {
    expect(resolveLegacyGrowthLocal("/growth/local/nonsense-only")).toEqual({ type: "gone" });
    expect(resolveLegacyGrowthLocal("/growth/local/deep-cleaning/extra/segment")).toEqual({ type: "gone" });
  });
});
