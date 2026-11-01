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

  it("retains the complete service and long place name", () => {
    const s = generateCtrTitle({
      base: "Cleaning Services",
      place: "Very Long Suburb Name Here, Cape Town",
      fromPrice: "~R450",
      templateKey: "test-long-place",
    });
    expect(s).toContain("Very Long Suburb Name Here, Cape Town");
    expect(s).not.toContain("…");
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
    expect(s.length).toBeLessThanOrEqual(68);
  });
  it("does not repeat location or brand in editorial titles", () => {
    const headline = "Deep Cleaning vs Regular Cleaning | Cape Town Guide | Shalean";
    const result = generateBlogArticleTitle({ headline, slugKey: "comparison" });
    expect(result.match(/Cape Town/g)).toHaveLength(1);
    expect(result.match(/Shalean/g)).toHaveLength(1);
    expect(result).not.toContain("…");
  });
  it("preserves long complete headlines instead of publishing ellipses", () => {
    const headline = "Deep Cleaning vs Regular Cleaning: What Is Included and Which Service Should You Book in Cape Town?";
    expect(generateBlogArticleTitle({ headline, slugKey: "comparison" })).toBe(headline);
  });
  it("does not add an unverified current year", () => {
    const result = generateBlogArticleTitle({ headline: "Cleaning checklist", slugKey: "checklist" });
    expect(result).not.toMatch(/\b20\d{2}\b/);
    expect(result).toContain("Shalean");
  });
  it("keeps the authored year and is idempotent", () => {
    const input = { headline: "Cleaning Costs Cape Town (2026) | Shalean", slugKey: "cost", year: 2026 };
    const result = generateBlogArticleTitle(input);
    expect(result.match(/2026/g)).toHaveLength(1);
    expect(generateBlogArticleTitle({ ...input, headline: result })).toBe(result);
  });

});

describe("clipSerpTitle", () => {
  it("preserves complete title text even when it exceeds the display budget", () => {
    expect(clipSerpTitle("a".repeat(80), 20)).toBe("a".repeat(80));
    expect(clipSerpTitle("  Cleaning   Services  ")).toBe("Cleaning Services");
  });
});
