import { describe, expect, it } from "vitest";
import {
  clampMetaDescription,
  generateMetaDescription,
  pickCtrHookPhrase,
  resolveBlogDbMetaDescription,
} from "./metaDescription";

describe("clampMetaDescription", () => {
  it("preserves concise authored descriptions without padding", () => {
    const copy = "Standard home cleaning between canopy dust seasons and busy school calendars.";
    expect(clampMetaDescription(copy)).toBe(copy);
  });
  it("repairs repeated live padding and remains idempotent", () => {
    const lead = "Standard home cleaning between canopy dust seasons and busy school calendars.";
    const pad = " Book trusted cleaners online today.";
    expect(clampMetaDescription(lead + pad + pad)).toBe(lead + pad);
    expect(clampMetaDescription(clampMetaDescription(lead + pad + pad))).toBe(lead + pad);
  });
  it("preserves full sentences beyond the old 160 character limit", () => {
    const copy = "Deep cleaning vs regular cleaning explained: what each includes, standard cleaning vs deep cleaning on time and cost, which cleaning service you need, and how to prepare your home.";
    expect(copy.length).toBeGreaterThan(160);
    expect(clampMetaDescription(copy)).toBe(copy);
  });
  it("normalizes whitespace without changing wording", () => {
    expect(clampMetaDescription("  Cleaning\n services  in Cape Town. ")).toBe("Cleaning services in Cape Town.");
  });
  it("has a complete empty-input fallback", () => {
    const result = clampMetaDescription(" ");
    expect(result).toContain("Cape Town");
    expect(result).toMatch(/\.$/);
    expect(clampMetaDescription(result)).toBe(result);
  });
  it("does not deduplicate unrelated authored sentences", () => {
    const copy = "Check access. Compare your service. Check access.";
    expect(clampMetaDescription(copy)).toBe(copy);
  });
});

describe("generateMetaDescription", () => {
  it("returns complete copy without a clipped ending", () => {
    const s = generateMetaDescription({});
    expect(s).toContain("Cape Town");
    expect(s).not.toMatch(/(?:\.\.\.|…)$/);
  });

  it("is deterministic for the same inputs (no random hooks)", () => {
    expect(generateMetaDescription({ service: "Test", location: "Cape Town" })).toBe(
      generateMetaDescription({ service: "Test", location: "Cape Town" }),
    );
  });

  it("rotates sentence structure by templateKey", () => {
    const a = generateMetaDescription({
      service: "Home cleaning services",
      location: "Sea Point, Cape Town",
      variant: "Trusted local cleaners near you",
      templateKey: "sea-point-cleaning-services",
    });
    const b = generateMetaDescription({
      service: "Home cleaning services",
      location: "Claremont, Cape Town",
      variant: "Trusted local cleaners near you",
      templateKey: "claremont-cleaning-services",
    });
    expect(a).not.toBe(b);
  });

  it("injects geo boost when provided", () => {
    const s = generateMetaDescription({
      service: "Home cleaning services",
      location: "Sea Point, Cape Town",
      variant: "Trusted local cleaners near you",
      geoBoost: "Serving Atlantic Seaboard homes",
      templateKey: "sea-point-cleaning-services",
    });
    expect(s.toLowerCase()).toContain("atlantic seaboard");
  });
});

describe("pickCtrHookPhrase", () => {
  it("is stable per key", () => {
    expect(pickCtrHookPhrase("deep-cleaning-cape-town")).toBe(pickCtrHookPhrase("deep-cleaning-cape-town"));
  });

  it("returns a substantive phrase", () => {
    expect(pickCtrHookPhrase("standard-cleaning-cape-town").length).toBeGreaterThan(4);
  });
});

describe("resolveBlogDbMetaDescription", () => {
  it("preserves authored meta when present", () => {
    const s = resolveBlogDbMetaDescription({
      metaTitle: "Test",
      title: "Test",
      metaDescription: "A".repeat(200),
      excerpt: null,
    });
    expect(s).toBe("A".repeat(200));
  });

  it("falls back to generator when meta and excerpt empty", () => {
    const s = resolveBlogDbMetaDescription({
      title: "How much does cleaning cost?",
      metaDescription: "",
      excerpt: "",
    });
    expect(s).toContain("Cape Town");
    expect(s).not.toMatch(/(?:\.\.\.|…)$/);
  });
});
