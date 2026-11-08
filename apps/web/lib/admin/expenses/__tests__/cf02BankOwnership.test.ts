import { describe, expect, it } from "vitest";
import { summarizeCf02BankSnapshots, type Cf02BankSnapshot } from "../cf02BankOwnership";

const ids = ["101", "102", "103", "104"];
const now = new Date("2026-11-03T08:00:00Z");
const banks: Cf02BankSnapshot[] = [
  { zohoAccountId:"101", accountName:"Income Account", bankBalanceCents:50199, feedRefreshedAt:"2026-11-03T06:00:00Z", currency:"ZAR",accountType:"bank",active:true,ownershipReconciled:false },
  { zohoAccountId:"102", accountName:"Expense Account", bankBalanceCents:281325, feedRefreshedAt:"2026-11-03T06:00:00Z", currency:"ZAR",accountType:"bank",active:true,ownershipReconciled:false },
  { zohoAccountId:"103", accountName:"Shalean Account", bankBalanceCents:1586236, feedRefreshedAt:"2026-11-03T06:00:00Z", currency:"ZAR",accountType:"bank",active:true,ownershipReconciled:false },
  { zohoAccountId:"104", accountName:"Bokkie Account", bankBalanceCents:2923173, feedRefreshedAt:"2026-11-03T06:00:00Z", currency:"ZAR",accountType:"bank",active:true,ownershipReconciled:false },
];
describe("CF-02 four bank snapshots (synthetic mapping fixture)", () => {
  it("sums verified physical holdings but never treats Bokkie funds as spendable", () => {
    const r = summarizeCf02BankSnapshots(banks,ids,now);
    expect(r.totalBankHeldCents).toBe(4840933);
    expect(r.bankBalancesVerified).toBe(true);
    expect(r.ownershipReady).toBe(false);
    expect(r.shaleanOwnedCents).toBeNull();
    expect(r.bokkieHeldCents).toBeNull();
    expect(r.safeToSpendCents).toBeNull();
  });
  it("fails closed on missing mapping, duplicate ID, stale feed and invalid currency", () => {
    for(const sample of [
      banks.slice(0,3),
      [...banks.slice(0,3), {...banks[3],zohoAccountId:"103"}],
      banks.map((x,i)=>i===0?{...x,feedRefreshedAt:"2026-01-01T00:00:00Z"}:x),
      banks.map((x,i)=>i===0?{...x,currency:"USD"}:x),
    ]) {
      const r=summarizeCf02BankSnapshots(sample,ids,now);
      expect(r.totalBankHeldCents).toBeNull();
      expect(r.safeToSpendCents).toBeNull();
      expect(r.bankBalancesVerified).toBe(false);
    }
  });
  it("does not turn a cross-bank transfer into extra holdings", () => {
    const before=summarizeCf02BankSnapshots(banks,ids,now).totalBankHeldCents;
    const transferred=banks.map((x,i)=>i===0?{...x,bankBalanceCents:x.bankBalanceCents-10000}:i===1?{...x,bankBalanceCents:x.bankBalanceCents+10000}:x);
    expect(summarizeCf02BankSnapshots(transferred,ids,now).totalBankHeldCents).toBe(before);
  });
  it("never marks ownership as proven from names or a boolean flag alone", () => {
    const r=summarizeCf02BankSnapshots(banks.map(x=>({...x,ownershipReconciled:true})),ids,now);
    expect(r.ownershipReady).toBe(false);
    expect(r.safeToSpendCents).toBeNull();
  });
});
