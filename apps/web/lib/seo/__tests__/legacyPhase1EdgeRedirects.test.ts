import { describe, expect, it } from "vitest";
import {
  resolveLegacyGrowthLocal,
  resolveLegacySingularLocation,
  resolveLegacyStage19IntentPath,
} from "@/lib/seo/legacyPhase1EdgeRedirects";

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
    expect(resolveLegacySingularLocation("cape-town", "not-a-real-suburb-xyz")).toEqual({
      type: "gone",
    });
  });

  it("returns gone for Johannesburg (no live area routes)", () => {
    expect(resolveLegacySingularLocation("johannesburg", "sandton")).toEqual({ type: "gone" });
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

  it("redirects two-segment URLs to location hubs (final destination)", () => {
    expect(resolveLegacyGrowthLocal("/growth/local/deep-cleaning/sea-point")).toEqual({
      type: "redirect",
      pathname: "/locations/sea-point-cleaning-services",
    });
  });

  it("redirects single-segment combined intent-suburb to hubs", () => {
    expect(resolveLegacyGrowthLocal("/growth/local/deep-cleaning-sea-point")).toEqual({
      type: "redirect",
      pathname: "/locations/sea-point-cleaning-services",
    });
  });

  it("falls back to service page when suburb hub missing", () => {
    expect(resolveLegacyGrowthLocal("/growth/local/airbnb-cleaning/not-a-real-suburb-xyz")).toEqual({
      type: "redirect",
      pathname: "/services/airbnb-cleaning-cape-town",
    });
  });

  it("returns gone for unparseable growth local tails", () => {
    expect(resolveLegacyGrowthLocal("/growth/local/nonsense-only")).toEqual({ type: "gone" });
    expect(resolveLegacyGrowthLocal("/growth/local/deep-cleaning/extra/segment")).toEqual({
      type: "gone",
    });
  });
});

describe("resolveLegacyStage19IntentPath", () => {
  it("redirects retired Stage-19 landings to hubs or services", () => {
    expect(resolveLegacyStage19IntentPath("/deep-cleaning/sea-point")).toEqual({
      type: "redirect",
      pathname: "/locations/sea-point-cleaning-services",
    });
    expect(resolveLegacyStage19IntentPath("/same-day-cleaning/unknown-suburb-xyz")).toEqual({
      type: "redirect",
      pathname: "/services/standard-cleaning-cape-town",
    });
  });

  it("returns null for non-intent paths", () => {
    expect(resolveLegacyStage19IntentPath("/services/deep-cleaning-cape-town")).toBeNull();
    expect(resolveLegacyStage19IntentPath("/blog/foo")).toBeNull();
  });
});
