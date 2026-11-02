import { describe, expect, it } from "vitest";
import { assessDuplicateInvoiceVoid, type DuplicateInvoiceVoidEvidence } from "../duplicateInvoiceVoidEvidence";
const evidence: DuplicateInvoiceVoidEvidence = {
 zohoInvoiceId:"253016000002396017", expectedZohoInvoiceId:"253016000002396017",
 zohoStatus:"Void", amountCents:36000,paidCents:0,balanceCents:36000,
 completedBookingStatus:"completed",completedBookingPaidCents:36000,
 cancelledBookingStatus:"cancelled",cancelledBookingPaidCents:0,
 originalSalesInvoicePaid:true
};
describe("duplicate monthly invoice reversal evidence",()=>{
 it("accepts observed state without authorizing financial writes",()=>{
  expect(assessDuplicateInvoiceVoid(evidence)).toEqual({evidenceConsistent:true,issues:[],productionWriteAuthorized:false});
 });
 it.each([
 ["not void",{zohoStatus:"Overdue"}],["wrong Zoho invoice",{zohoInvoiceId:"other"}],
 ["unexpected paid amount",{paidCents:36000}],["changed completed booking",{completedBookingPaidCents:0}],
 ["cancelled booking was paid",{cancelledBookingPaidCents:36000}],
 ["original invoice unverified",{originalSalesInvoicePaid:false}],
 ] as const)("%s fails closed",(_,patch)=>{
  const r=assessDuplicateInvoiceVoid({...evidence,...patch});
  expect(r.evidenceConsistent).toBe(false);expect(r.productionWriteAuthorized).toBe(false);
 });
});
