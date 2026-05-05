import { describe, expect, it } from "vitest";
import { leadPriceForServiceSlug } from "./serviceTitleLeadPrice";

describe("leadPriceForServiceSlug", () => {
  it("returns band for known slugs", () => {
    expect(leadPriceForServiceSlug("deep-cleaning-cape-town")).toBe("~R500");
    expect(leadPriceForServiceSlug("move-out-cleaning-cape-town")).toBe("~R800");
  });

  it("falls back for unknown slug", () => {
    expect(leadPriceForServiceSlug("unknown-slug")).toBe("~R280");
  });
});
