import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("CF-01 recorded versus projected cash-flow definitions", () => {
  it("keeps recorded net based on settlement inflows and recorded outflows", () => {
    const loader = read("lib/admin/expenses/loadCashFlowDashboard.ts");
    expect(loader).toContain("const moneyReceivedNet = recordedSettlements.settled_to_bank_cents;");
    expect(loader).toContain("loadRecordedSettlementsByDate(admin, from, to)");
    expect(loader).toContain("loadRecordedCleanerPayoutCash(admin, from, to)");
    expect(loader).toContain("loadRecordedExpenseCash(admin, from, to)");
    expect(loader).toContain("const moneyPaid = paidCleanerCash.paid_cents + recordedExpenses.cash_out_cents;");
    expect(loader).toContain("const netCashFlow = moneyReceivedNet - moneyPaid;");
    expect(loader).toContain("const forecast = await loadCashFlowForecast(admin, from, to);");
    expect(loader).toContain("expected_income_cents: forecast.income_cents");
    expect(loader).toContain("expected_expenses_cents: forecast.expenses_cents");
  });

  it("explicitly separates recorded net from the incomplete forecast in the UI", () => {
    const page = read("app/(ui-redesign)/office/cash-flow/page.tsx");
    expect(page).toContain("Payouts + approved expenses");
    expect(page).toContain("Provisional net · settlements less payouts/approved expenses");
    expect(page).toContain("approval and a selected payment method do not verify a matched bank debit");
    expect(page).toContain("Bank-verified expense cash outflow is not available from this source.");
    expect(page).toContain("Expected income and expected expenses are a separate, incomplete forecast");
    expect(page).toContain("Provisional net is not a reconciled all-bank cash movement total.");
    expect(page).toContain("Daily provisional net cash flow");
    expect(page).toContain("Recorded inflows vs provisional outflows (monthly)");
  });
});

