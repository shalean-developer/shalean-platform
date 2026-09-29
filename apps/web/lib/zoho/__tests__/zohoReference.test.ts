import { describe, expect, it } from "vitest";
import {
  formatZohoReference,
  ZOHO_REFERENCE_MAX_LENGTH,
} from "@/lib/zoho/zohoReference";

describe("formatZohoReference", () => {
  it("keeps short references unchanged apart from trimming", () => {
    expect(formatZohoReference("  paystack_123  ")).toBe("paystack_123");
  });

  it("shortens long references to Zoho's strict under-50-character limit", () => {
    const value = "paystack_" + "a".repeat(80);
    const result = formatZohoReference(value);

    expect(result.length).toBeLessThan(50);
    expect(result.length).toBe(ZOHO_REFERENCE_MAX_LENGTH);
    expect(result).toMatch(/-[0-9a-f]{8}$/);
  });

  it("is deterministic for retries", () => {
    const value = "paystack_" + "b".repeat(80);
    expect(formatZohoReference(value)).toBe(formatZohoReference(value));
  });

  it("keeps distinct long references distinct", () => {
    const prefix = "paystack_" + "c".repeat(70);
    expect(formatZohoReference(prefix + "1")).not.toBe(formatZohoReference(prefix + "2"));
  });
});
