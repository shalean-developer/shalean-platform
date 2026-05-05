import { describe, expect, it } from "vitest";
import {
  clipSerpTitle,
  generateBlogArticleTitle,
  generateCtrTitle,
  stableTitleStructureIndex,
} from "./metaTitle";

describe("generateCtrTitle", () => {
  it("is deterministic for the same templateKey", () => {
    expect(
      generateCtrTitle({
        base: "Cleaning Services",
        place: "Sea Point, Cape Town",
        fromPrice: "~R450",
        templateKey: "sea-point-cleaning-services|A",
      }),
    ).toBe(
      generateCtrTitle({
        base: "Cleaning Services",
        place: "Sea Point, Cape Town",
        fromPrice: "~R450",
        templateKey: "sea-point-cleaning-services|A",
      }),
    );
  });

  it("respects max length", () => {
    const s = generateCtrTitle({
      base: "Cleaning Services",
      place: "Very Long Suburb Name Here, Cape Town",
      fromPrice: "~R450",
      templateKey: "test-long-place",
    });
    expect(s.length).toBeLessThanOrEqual(58);
  });

  it("uses near-you language for location intent", () => {
    const s = generateCtrTitle({
      base: "Home Cleaning Services",
      place: "Sea Point, Cape Town",
      fromPrice: "~R450",
      templateKey: "sea-point-test",
      pageIntent: "location",
    });
    expect(s.toLowerCase()).toContain("near you");
  });

  it("differs across hubs (place + templateKey)", () => {
    const a = generateCtrTitle({
      base: "Cleaning Services",
      place: "Sea Point, Cape Town",
      fromPrice: "~R450",
      templateKey: "sea-point-cleaning-services|A",
    });
    const b = generateCtrTitle({
      base: "Cleaning Services",
      place: "Claremont, Cape Town",
      fromPrice: "~R400",
      templateKey: "claremont-cleaning-services|A",
    });
    expect(a).not.toBe(b);
  });
});

describe("stableTitleStructureIndex", () => {
  it("is stable", () => {
    expect(stableTitleStructureIndex("x", 4)).toBe(stableTitleStructureIndex("x", 4));
  });
});

describe("generateBlogArticleTitle", () => {
  it("includes year and Cape Town", () => {
    let slugForStructure0 = "blog-0";
    for (let i = 0; i < 400; i++) {
      const k = `blog-${i}`;
      if (stableTitleStructureIndex(k, 2) === 0) {
        slugForStructure0 = k;
        break;
      }
    }
    const s = generateBlogArticleTitle({
      headline: "How Much Does Cleaning Cost?",
      slugKey: slugForStructure0,
      year: 2026,
    });
    expect(s).toContain("2026");
    expect(s.toLowerCase()).toContain("cape town");
    expect(s.length).toBeLessThanOrEqual(72);
  });
});

describe("clipSerpTitle", () => {
  it("truncates long strings", () => {
    expect(clipSerpTitle("a".repeat(80), 20).length).toBeLessThanOrEqual(20);
    expect(clipSerpTitle("a".repeat(80), 20).endsWith("…")).toBe(true);
  });
});
