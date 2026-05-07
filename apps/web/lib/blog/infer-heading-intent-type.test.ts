import { describe, expect, it } from "vitest";
import { inferHeadingIntentType } from "./infer-heading-intent-type";

describe("inferHeadingIntentType", () => {
  it("classifies common editorial patterns", () => {
    expect(inferHeadingIntentType("Pricing & what it costs")).toBe("pricing");
    expect(inferHeadingIntentType("Frequently asked questions")).toBe("faq");
    expect(inferHeadingIntentType("Move-out checklist")).toBe("checklist");
    expect(inferHeadingIntentType("Deep clean vs standard")).toBe("comparison");
    expect(inferHeadingIntentType("Why choose Shalean")).toBe("trust");
    expect(inferHeadingIntentType("How it works")).toBe("process");
    expect(inferHeadingIntentType("Benefits of booking weekly")).toBe("benefits");
    expect(inferHeadingIntentType("Cape Town service areas")).toBe("local_area");
  });

  it("uses heading id when the label is generic", () => {
    expect(inferHeadingIntentType("Overview", "faq-move-out")).toBe("faq");
    expect(inferHeadingIntentType("Section", "pricing-deep-clean")).toBe("pricing");
  });

  it("returns null when no rule matches", () => {
    expect(inferHeadingIntentType("Introduction")).toBeNull();
  });
});
