import { describe,it,expect } from "vitest";
import { isMonthlyInvoiceCollectible } from "../isMonthlyInvoiceCollectible";
describe("monthly invoice payment eligibility", () => {
 it("blocks an overdue invoice once it is closed", () => {
  expect(isMonthlyInvoiceCollectible({status:"overdue",is_closed:true,balance_cents:36000})).toBe(false);
 });
 it("blocks non-payable statuses even when a balance remains", () => {
  for (const status of ["void","paid","refunded"]) expect(isMonthlyInvoiceCollectible({status,is_closed:false,balance_cents:36000})).toBe(false);
 });
 it("preserves ordinary open invoice payments", () => {
  expect(isMonthlyInvoiceCollectible({status:"sent",is_closed:false,balance_cents:36000})).toBe(true);
 });
 it("blocks zero-balance invoices", () => {
  expect(isMonthlyInvoiceCollectible({status:"sent",is_closed:false,balance_cents:0})).toBe(false);
 });
});
