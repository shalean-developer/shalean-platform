import { describe, expect, it } from "vitest";

import {
  isShaleanSystemLoginEmail,
  normalizeBillingEmail,
  pickBillingEmail,
} from "@/lib/zoho/shaleanBillingContactEmail";

describe("shaleanBillingContactEmail", () => {
  it("detects Shalean system login emails", () => {
    expect(isShaleanSystemLoginEmail("27691445709@cleaner.shalean.com")).toBe(true);
    expect(isShaleanSystemLoginEmail("27824103968@walkin.shalean.com")).toBe(true);
    expect(isShaleanSystemLoginEmail("mongezib@arcfyre.com")).toBe(false);
  });

  it("rejects synthetic login emails for billing", () => {
    expect(normalizeBillingEmail("27691445709@cleaner.shalean.com")).toBeNull();
    expect(normalizeBillingEmail("27824103968@walkin.shalean.com")).toBeNull();
    expect(normalizeBillingEmail("mongezib@arcfyre.com")).toBe("mongezib@arcfyre.com");
  });

  it("prefers the first real billing email", () => {
    expect(
      pickBillingEmail([
        "27691445709@cleaner.shalean.com",
        "mongezib@arcfyre.com",
        "27824103968@walkin.shalean.com",
      ]),
    ).toBe("mongezib@arcfyre.com");
  });
});
