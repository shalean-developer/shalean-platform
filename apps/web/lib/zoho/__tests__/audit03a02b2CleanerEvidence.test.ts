import { describe, expect, it } from "vitest";
import { candidateCleanerMatches, withinWindow, zarCents, uniqueEvidence, potentiallySettled } from "../../../scripts/zohoCleanerEvidenceMatching";

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
  it("deduplicates only source-specific provider IDs", () => {
    const expense = {source:"expenses" as const,expense_id:"e1",date:"2026-06-20"};
    const bank = {source:"banktransactions" as const,transaction_id:"e1",date:"2026-06-20"};
    const result = uniqueEvidence([expense,expense,bank]);
    expect(result.rows).toHaveLength(2);
    expect(result.unknownIdentity).toBe(0);
  });
  it("never treats an expense or uncleared transfer as proven settlement", () => {
    expect(potentiallySettled({source:"expenses",status:"paid",transaction_type:"expense"})).toBe(false);
    expect(potentiallySettled({source:"banktransactions",status:"pending",transaction_type:"withdrawal"})).toBe(false);
    expect(potentiallySettled({source:"banktransactions",status:"reconciled",transaction_type:"withdrawal"})).toBe(true);
  });
  it("counts unidentified evidence as unresolved instead of silently dropping it", () => {
    const result = uniqueEvidence([{source:"expenses",date:"2026-06-20"}]);
    expect(result.unknownIdentity).toBe(1);
  });
  it("includes full payee fields without risky single-name matching", () => {
    expect(candidateCleanerMatches({source:"banktransactions",payee:"Example Cleaner Two"},cleaners)).toEqual(["b"]);
    expect(candidateCleanerMatches({source:"banktransactions",payee:"Example"},cleaners)).toEqual([]);
  });
});
