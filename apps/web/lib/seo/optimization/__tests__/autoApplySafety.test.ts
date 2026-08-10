import { describe, expect, it } from "vitest";
import {
  isHubUiAutoApplyAllowed,
  isTitleAutoApplyAllowed,
  parseManualHubUiSlugs,
  SEO_AUTO_APPLY_MAX_PER_TYPE,
  SEO_AUTO_APPLY_MIN_CONFIDENCE,
} from "@/lib/seo/optimization/auto-apply-safety";

describe("SEO auto-apply safety", () => {
  it("requires the defined minimum confidence", () => {
    expect(SEO_AUTO_APPLY_MIN_CONFIDENCE).toBe(0.35);
    expect(isTitleAutoApplyAllowed({ confidence: 0.349, hasManualTitle: false, hasExplicitEnvVariant: false })).toBe(false);
    expect(isTitleAutoApplyAllowed({ confidence: 0.35, hasManualTitle: false, hasExplicitEnvVariant: false })).toBe(true);
  });

  it("never overwrites manual or explicit title choices", () => {
    expect(isTitleAutoApplyAllowed({ confidence: 0.99, hasManualTitle: true, hasExplicitEnvVariant: false })).toBe(false);
    expect(isTitleAutoApplyAllowed({ confidence: 0.99, hasManualTitle: false, hasExplicitEnvVariant: true })).toBe(false);
  });

  it("parses and normalizes manually protected hub slugs", () => {
    const slugs = parseManualHubUiSlugs(" /Sea-Point-Cleaning-Services/, camps-bay-cleaning-services ");
    expect(slugs.has("sea-point-cleaning-services")).toBe(true);
    expect(slugs.has("camps-bay-cleaning-services")).toBe(true);
  });

  it("blocks auto hub UI changes for protected slugs", () => {
    const manualHubUiSlugs = new Set(["sea-point-cleaning-services"]);
    expect(isHubUiAutoApplyAllowed({ slug: "Sea-Point-Cleaning-Services", confidence: 0.9, manualHubUiSlugs })).toBe(false);
    expect(isHubUiAutoApplyAllowed({ slug: "claremont-cleaning-services", confidence: 0.9, manualHubUiSlugs })).toBe(true);
  });

  it("caps each auto-apply type to a small blast radius", () => {
    expect(SEO_AUTO_APPLY_MAX_PER_TYPE).toBe(10);
  });
});
