import { describe, expect, it } from "vitest";
import { computeBookingProfit, computeProfitBreakdown } from "@/lib/admin/expenses/profitCalculations";

describe("computeProfitBreakdown", () => {
  it("calculates gross margin and net profit", () => {
    const result = computeProfitBreakdown(100_000, 60_000, 15_000);
    expect(result.customer_revenue_cents).toBe(100_000);
    expect(result.cleaner_payouts_cents).toBe(60_000);
    expect(result.gross_margin_cents).toBe(40_000);
    expect(result.operating_expenses_cents).toBe(15_000);
    expect(result.net_profit_cents).toBe(25_000);
    expect(result.gross_margin_percent).toBe(40);
    expect(result.net_profit_percent).toBe(25);
  });

  it("excludes pending expenses from profit (caller responsibility)", () => {
    const approvedOnly = computeProfitBreakdown(50_000, 30_000, 5_000);
    expect(approvedOnly.net_profit_cents).toBe(15_000);
  });
});

describe("computeBookingProfit", () => {
  it("subtracts booking expenses from customer minus cleaner", () => {
    const result = computeBookingProfit(25_000, 15_000, 2_000);
    expect(result.net_booking_profit_cents).toBe(8_000);
  });
});
