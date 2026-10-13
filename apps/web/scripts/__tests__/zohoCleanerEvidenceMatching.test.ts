import { describe, expect, it } from "vitest";
import { candidateCleanerMatches, withinWindow, zarCents } from "../zohoCleanerEvidenceMatching";

const cleaners = [
  { id: "a", name: "Example Cleaner One" },
  { id: "b", name: "Example Cleaner Two" },
];

describe("AUDIT-03A-02B.2 Zoho read-only candidate matching", () => {
  it("matches full cleaner names but never a first-name-only reference", () => {
    expect(candidateCleanerMatches({source:"expenses", description:"EFT EXAMPLE CLEANER ONE June"},cleaners)).toEqual(["a"]);
    expect(candidateCleanerMatches({source:"expenses", description:"EFT Example June"},cleaners)).toEqual([]);
  });
  it("does not treat currency other than ZAR as comparable", () => {
    expect(zarCents({source:"expenses",total:250,currency_code:"USD"})).toBeNull();
    expect(zarCents({source:"expenses",total:250,currency_code:"ZAR"})).toBe(25000);
  });
  it("keeps the audit window closed", () => {
    expect(withinWindow("2026-06-20")).toBe(true);
    expect(withinWindow("2026-07-31")).toBe(true);
    expect(withinWindow("2026-08-01")).toBe(false);
    expect(withinWindow(undefined)).toBe(false);
  });
});
