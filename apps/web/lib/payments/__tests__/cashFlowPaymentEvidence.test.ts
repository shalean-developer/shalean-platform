import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCashFlowPaymentEvidence, summarizeCashFlowPaymentEvidence, type CashFlowPaymentRow } from "../loadCashFlowPaymentEvidence";
const payment = (patch: Partial<CashFlowPaymentRow> = {}): CashFlowPaymentRow => ({
  id:"one", gateway_reference:"charge-one", gateway_transaction_id:"123", amount_cents:75500,
  processing_fee_cents:2207, fee_calculation_method:"paystack_reported", currency_code:"ZAR", payment_channel:null, ...patch,
});
describe("cash-flow payment evidence", () => {
  it("uses actual provider gross and fee cents without booking values", () => {
    expect(summarizeCashFlowPaymentEvidence([payment()])).toMatchObject({gross_cents:75500,reported_fee_cents:2207,fees_verified:true});
  });
  it("excludes refunds without suppressing provider-reported receipt fees", () => {
    const receipt = payment();
    const refund = payment({id:"refund",gateway_reference:"refund-one",gateway_transaction_id:null,payment_channel:"refund",processing_fee_cents:0});
    expect(summarizeCashFlowPaymentEvidence([receipt,refund])).toMatchObject({transaction_count:1,gross_cents:75500,reported_fee_cents:2207,fees_verified:true,unverified_payment_count:0});
    expect(summarizeCashFlowPaymentEvidence([refund])).toMatchObject({transaction_count:0,gross_cents:0,fees_verified:false});
  });
  it("does not call an empty local ledger fee-free", () => {
    expect(summarizeCashFlowPaymentEvidence([])).toMatchObject({gross_cents:0,fees_verified:false});
  });
  it("does not present estimated fees as actual provider fees", () => {
    expect(summarizeCashFlowPaymentEvidence([payment({fee_calculation_method:"calculated_sa_default"})])).toMatchObject({gross_cents:75500,reported_fee_cents:0,unverified_fee_count:1,fees_verified:false});
  });
  it("does not count synthetic backfills as verified receipts", () => {
    expect(summarizeCashFlowPaymentEvidence([payment({gateway_transaction_id:null})])).toMatchObject({gross_cents:0,unverified_payment_count:1,fees_verified:false});
  });
  it("accepts an explicitly provider-reported zero fee", () => {
    expect(summarizeCashFlowPaymentEvidence([payment({processing_fee_cents:0})])).toMatchObject({reported_fee_cents:0,fees_verified:true});
  });
  it.each([null,-1,75501])("flags invalid or absent provider fee %s", (fee) => {
    expect(summarizeCashFlowPaymentEvidence([payment({processing_fee_cents:fee})]).fees_verified).toBe(false);
  });
  it("rejects duplicate references instead of double counting", () => {
    expect(()=>summarizeCashFlowPaymentEvidence([payment(),payment({id:"two"})])).toThrow("Duplicate");
  });
  it("rejects mixed currencies rather than adding them as rand", () => {
    expect(()=>summarizeCashFlowPaymentEvidence([payment({currency_code:"USD"})])).toThrow("currency");
  });
  it("uses Johannesburg payment boundaries, stable pagination, and propagates read failure", async () => {
    const calls: Record<string, unknown[][]> = {};
    let fail = false;
    const query:Record<string,unknown> = {};
    for (const method of ["select","eq","gte","lt","order"]) query[method]=(...args:unknown[])=>{(calls[method]??=[]).push(args);return query;};
    query.range=vi.fn(async(a:number)=>({data:a===0?Array.from({length:500},(_,i)=>payment({id:String(i),gateway_reference:String(i)})):[payment({id:"last",gateway_reference:"last"})],error:fail?{message:"database unavailable"}:null}));
    const admin={from:()=>query} as unknown as SupabaseClient;
    expect((await loadCashFlowPaymentEvidence(admin,"2026-11-01","2026-11-30")).transaction_count).toBe(501);
    expect(calls.gte).toContainEqual(["paid_at","2026-10-31T22:00:00.000Z"]);
    expect(calls.lt).toContainEqual(["paid_at","2026-11-30T22:00:00.000Z"]);
    expect(calls.eq).toContainEqual(["gateway","paystack"]);
    expect(query.range).toHaveBeenCalledWith(500,999);
    fail=true;
    await expect(loadCashFlowPaymentEvidence(admin,"2026-11-01","2026-11-30")).rejects.toThrow("database unavailable");
  });
});
