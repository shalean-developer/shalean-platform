import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const load = (p: string) => readFileSync(resolve(process.cwd(),p),"utf8");
describe("voided monthly invoice receivable guard",()=>{
 it("excludes closed invoices from cash-survival figures",()=>{
  const s=load("lib/admin/expenses/loadCashSurvivalDashboard.ts");
  expect(s).toContain('.select("status, is_closed, balance_cents, due_date, month")');
  expect(s).toContain("if (row.is_closed === true) continue;");
 });
 it("excludes closed invoices from checkout and account collections",()=>{
  expect(load("lib/pay/loadPayMonthlyInvoiceLanding.ts")).toContain("isMonthlyInvoiceCollectible");
  expect(load("lib/monthlyInvoice/monthlyInvoiceAccountCollection.ts")).toContain('if (anchor.is_closed === true)');
 });
});
