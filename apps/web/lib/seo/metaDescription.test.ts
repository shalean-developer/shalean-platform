import { describe, expect, it } from "vitest";
import {
  clampMetaDescription,
  generateMetaDescription,
  pickCtrHookPhrase,
  resolveBlogDbMetaDescription,
} from "./metaDescription";

describe("clampMetaDescription", () => {
  it("pads short strings to at least 120 chars", () => {
    const s = clampMetaDescription("Short.");
    expect(s.length).toBeGreaterThanOrEqual(120);
    expect(s.length).toBeLessThanOrEqual(160);
  });

  it("truncates long strings to at most 160 chars", () => {
    const long = "word ".repeat(80).trim();
    const s = clampMetaDescription(long);
    expect(s.length).toBeLessThanOrEqual(160);
    expect(s.endsWith("...")).toBe(true);
  });

  it("normalizes whitespace and stays within bounds", () => {
    const mid =
      "Cleaning services in Sea Point, Cape Town. Trusted cleaners, upfront pricing, and easy online booking. Book today. Extra detail so the base string clears the minimum length.";
    const s = clampMetaDescription(`  ${mid.replace(/\./g, ". ")}  `);
    expect(s.length).toBeGreaterThanOrEqual(120);
    expect(s.length).toBeLessThanOrEqual(160);
  });
});

describe("generateMetaDescription", () => {
  it("returns copy already within 120–160 chars", () => {
    const s = generateMetaDescription({});
    expect(s.length).toBeGreaterThanOrEqual(120);
    expect(s.length).toBeLessThanOrEqual(160);
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
  it("uses meta when present and clamps", () => {
    const s = resolveBlogDbMetaDescription({
      metaTitle: "Test",
      title: "Test",
      metaDescription: "A".repeat(200),
      excerpt: null,
    });
    expect(s.length).toBeLessThanOrEqual(160);
  });

  it("falls back to generator when meta and excerpt empty", () => {
    const s = resolveBlogDbMetaDescription({
      title: "How much does cleaning cost?",
      metaDescription: "",
      excerpt: "",
    });
    expect(s.length).toBeGreaterThanOrEqual(120);
    expect(s.length).toBeLessThanOrEqual(160);
  });
});
