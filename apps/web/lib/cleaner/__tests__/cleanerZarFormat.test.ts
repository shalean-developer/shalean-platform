import { describe, expect, it } from "vitest";
import { formatCleanerJobEarningsLabel, formatZarFromCents } from "@/lib/cleaner/cleanerZarFormat";

describe("formatCleanerJobEarningsLabel", () => {
  it("returns em dash for null and undefined", () => {
    expect(formatCleanerJobEarningsLabel(null)).toBe("—");
    expect(formatCleanerJobEarningsLabel(undefined)).toBe("—");
  });

  it("formats zero as R0 (actual zero)", () => {
    expect(formatCleanerJobEarningsLabel(0)).toMatch(/^R0/);
  });

  it("prefixes Est. when estimate", () => {
    const s = formatCleanerJobEarningsLabel(25_000, { estimate: true });
    expect(s.startsWith("Est. R")).toBe(true);
  });

  it("does not prefix when finalized", () => {
    const s = formatCleanerJobEarningsLabel(25_000, { estimate: false });
    expect(s.startsWith("R")).toBe(true);
    expect(s.includes("Est.")).toBe(false);
  });
});

describe("formatZarFromCents (unchanged contract for numeric inputs)", () => {
  it("formats positive cents", () => {
    expect(formatZarFromCents(25_000)).toContain("250");
  });
});
