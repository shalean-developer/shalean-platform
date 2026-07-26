import { describe, expect, it } from "vitest";
import { computeOfficeVisitDayFinance } from "@/lib/admin/dashboardVisitDayFinance";

describe("computeOfficeVisitDayFinance", () => {
  it("separates visit-day paid value from unpaid completed and monthly children", () => {
    const finance = computeOfficeVisitDayFinance([
      {
        id: "paid-completed",
        status: "completed",
        payment_status: "success",
        payment_completed_at: "2026-05-10T08:00:00.000Z",
        payment_method: "card",
        amount_paid_cents: 50_000,
        total_paid_zar: 500,
        total_price: 500,
      },
      {
        id: "unpaid-completed",
        status: "completed",
        payment_status: "pending",
        payment_completed_at: null,
        amount_paid_cents: 0,
        total_paid_zar: 0,
        total_price: 450,
      },
      {
        id: "monthly-child",
        status: "completed",
        payment_status: "success",
        payment_completed_at: "2026-05-01T08:00:00.000Z",
        amount_paid_cents: 40_000,
        total_paid_zar: 400,
        total_price: 400,
        is_monthly_billing_booking: true,
        monthly_invoice_id: "inv-1",
        billing_type: "recurring_invoice",
      },
      {
        id: "cancelled",
        status: "cancelled",
        payment_status: "success",
        payment_completed_at: "2026-05-01T08:00:00.000Z",
        amount_paid_cents: 30_000,
        total_paid_zar: 300,
        total_price: 300,
      },
    ]);

    expect(finance.paidCount).toBe(1);
    expect(finance.paidValueZar).toBe(500);
    expect(finance.completedPaidCount).toBe(1);
    expect(finance.completedPaidValueZar).toBe(500);
    expect(finance.unpaidCompletedCount).toBe(1);
    expect(finance.unpaidCompletedQuotedZar).toBe(450);
    expect(finance.monthlyChildCount).toBe(1);
    expect(finance.monthlyChildPaidZar).toBe(400);
    expect(finance.byPaymentMethod.card).toEqual({ count: 1, zar: 500 });
    expect(finance.quotedTotalZar).toBe(500 + 450 + 400);
  });

  it("explains nine completed prepaid visits with zero payments-received-today", () => {
    // Visit day completed; payment landed on an earlier day → visit paid value > 0,
    // while dashboard payment-day revenue stays 0 (tested separately in dashboardRevenue).
    const finance = computeOfficeVisitDayFinance(
      Array.from({ length: 9 }, (_, i) => ({
        id: `b-${i}`,
        status: "completed",
        payment_status: "success",
        payment_completed_at: "2026-05-01T10:00:00.000Z",
        payment_method: "eft",
        amount_paid_cents: 35_000,
        total_paid_zar: 350,
        total_price: 350,
      })),
    );

    expect(finance.completedPaidCount).toBe(9);
    expect(finance.completedPaidValueZar).toBe(3150);
    expect(finance.unpaidCompletedCount).toBe(0);
    expect(finance.paidValueZar).toBe(3150);
  });
});
