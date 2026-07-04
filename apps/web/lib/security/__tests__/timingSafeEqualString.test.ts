import { describe, expect, it } from "vitest";
import { timingSafeEqualString } from "@/lib/security/timingSafeEqualString";

describe("timingSafeEqualString", () => {
  it("returns true for equal strings", () => {
    expect(timingSafeEqualString("abc", "abc")).toBe(true);
  });

  it("returns false for different lengths", () => {
    expect(timingSafeEqualString("abc", "abcd")).toBe(false);
  });

  it("returns false for same length different content", () => {
    expect(timingSafeEqualString("abc", "abd")).toBe(false);
  });
});
