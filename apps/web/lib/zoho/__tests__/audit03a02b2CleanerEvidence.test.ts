import { describe, expect, it } from "vitest";
import { candidateCleanerMatches, withinWindow, zarCents, uniqueEvidence, potentiallySettled, listZohoEvidencePages } from "../../../scripts/zohoCleanerEvidenceMatching";

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
  it("never treats an expense or Zoho status as proven bank settlement", () => {
    expect(potentiallySettled({source:"expenses",status:"paid",transaction_type:"expense"})).toBe(false);
    expect(potentiallySettled({source:"banktransactions",status:"pending",transaction_type:"withdrawal"})).toBe(false);
    expect(potentiallySettled({source:"banktransactions",status:"reconciled",transaction_type:"withdrawal"})).toBe(false);
  });
  it("counts unidentified evidence as unresolved instead of silently dropping it", () => {
    const result = uniqueEvidence([{source:"expenses",date:"2026-06-20"}]);
    expect(result.unknownIdentity).toBe(1);
  });
  it("includes full payee fields without risky single-name matching", () => {
    expect(candidateCleanerMatches({source:"banktransactions",payee:"Example Cleaner Two"},cleaners)).toEqual(["b"]);
    expect(candidateCleanerMatches({source:"banktransactions",payee:"Example"},cleaners)).toEqual([]);
  });

  it("accepts Zoho expense array page_context and stops on a short page", async () => {
    const called: string[] = [];
    const get = async (path: string) => {
      called.push(path);
      return {expenses:[{expense_id:"e1",date:"2026-06-20"}],page_context:[{page:1,per_page:200}]};
    };
    const rows = await listZohoEvidencePages("expenses",get);
    expect(rows).toHaveLength(1);
    expect(called).toEqual(["/expenses?date_start=2026-06-01&date_end=2026-07-31&per_page=200&page=1"]);
  });
  it("accepts documented bank list without page_context and correct date filters", async () => {
    const paths: string[] = [];
    const result = await listZohoEvidencePages("banktransactions",async path => {
      paths.push(path);
      return {banktransactions:[{transaction_id:"b1",date:"2026-06-20"}]};
    });
    expect(result).toHaveLength(1);
    expect(paths).toEqual(["/banktransactions?date_after=2026-05-31&date_before=2026-08-01&per_page=200&page=1"]);
  });
  it("rejects missing arrays, malformed row and oversized pages", async () => {
    await expect(listZohoEvidencePages("banktransactions",async()=>({
      banktransactions:null
    }))).rejects.toThrow("missing array");
    await expect(listZohoEvidencePages("expenses",async()=>({
      expenses:[null]
    }))).rejects.toThrow("malformed row");
    await expect(listZohoEvidencePages("expenses",async()=>({
      expenses:Array.from({length:201},()=>({date:"2026-06-20"}))
    }))).rejects.toThrow("oversized page");
  });
  it("rejects endless full pages instead of reporting partial evidence", async () => {
    let calls = 0;
    const records = Array.from({length:200},(_,i)=>({expense_id:String(i),date:"2026-06-20"}));
    await expect(listZohoEvidencePages("expenses",async()=>{
      calls++;
      return {expenses:records};
    })).rejects.toThrow("exceeded 20 pages");
    expect(calls).toBe(20);
  });

});
