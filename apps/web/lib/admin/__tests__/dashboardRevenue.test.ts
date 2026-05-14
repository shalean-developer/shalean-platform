import { describe, expect, it } from "vitest";
import {
  computeAdminDashboardRevenueSummary,
  isAdminDashboardRevenueEligible,
  type AdminDashboardRevenueRow,
} from "@/lib/admin/dashboardRevenue";

const NOW = new Date("2026-05-14T10:00:00.000Z");

function value<K extends keyof AdminDashboardRevenueRow>(
  overrides: Partial<AdminDashboardRevenueRow>,
  key: K,
  fallback: AdminDashboardRevenueRow[K],
): AdminDashboardRevenueRow[K] {
  return Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] as AdminDashboardRevenueRow[K] : fallback;
}

function row(overrides: Partial<AdminDashboardRevenueRow>): AdminDashboardRevenueRow {
  return {
    id: value(overrides, "id", "booking-1"),
    status: value(overrides, "status", "pending"),
    payment_status: value(overrides, "payment_status", "success"),
    payment_completed_at: value(overrides, "payment_completed_at", "2026-05-14T08:00:00.000Z"),
    total_paid_zar: value(overrides, "total_paid_zar", 500),
    amount_paid_cents: value(overrides, "amount_paid_cents", 50_000),
    refunded_at: value(overrides, "refunded_at", null),
    refund_status: value(overrides, "refund_status", null),
    billing_type: value(overrides, "billing_type", "prepaid"),
    is_monthly_billing_booking: value(overrides, "is_monthly_billing_booking", false),
    monthly_invoice_id: value(overrides, "monthly_invoice_id", null),
  };
}

describe("isAdminDashboardRevenueEligible", () => {
  it("requires canonical successful payment evidence", () => {
    expect(isAdminDashboardRevenueEligible(row({ payment_status: "success" }))).toBe(true);
    expect(isAdminDashboardRevenueEligible(row({ payment_status: "paid" }))).toBe(false);
    expect(isAdminDashboardRevenueEligible(row({ payment_completed_at: null }))).toBe(false);
    expect(isAdminDashboardRevenueEligible(row({ amount_paid_cents: 0, total_paid_zar: 0 }))).toBe(false);
  });

  it("excludes cancelled failed expired and refunded rows", () => {
    expect(isAdminDashboardRevenueEligible(row({ status: "cancelled" }))).toBe(false);
    expect(isAdminDashboardRevenueEligible(row({ status: "failed" }))).toBe(false);
    expect(isAdminDashboardRevenueEligible(row({ status: "payment_expired" }))).toBe(false);
    expect(isAdminDashboardRevenueEligible(row({ refunded_at: "2026-05-14T09:00:00.000Z" }))).toBe(false);
    expect(isAdminDashboardRevenueEligible(row({ refund_status: "reversed" }))).toBe(false);
    expect(isAdminDashboardRevenueEligible(row({ refund_status: "chargeback" }))).toBe(false);
  });

  it("excludes monthly invoice children to avoid double counting invoice collections", () => {
    expect(isAdminDashboardRevenueEligible(row({ monthly_invoice_id: "invoice-1" }))).toBe(false);
    expect(isAdminDashboardRevenueEligible(row({ is_monthly_billing_booking: true }))).toBe(false);
    expect(isAdminDashboardRevenueEligible(row({ billing_type: "recurring_invoice" }))).toBe(false);
    expect(isAdminDashboardRevenueEligible(row({ billing_type: "monthly_contract" }))).toBe(false);
    expect(isAdminDashboardRevenueEligible(row({ billing_type: "prepaid", monthly_invoice_id: null }))).toBe(true);
  });
});

describe("computeAdminDashboardRevenueSummary", () => {
  it("buckets revenue by Johannesburg payment day, not booking creation", () => {
    const summary = computeAdminDashboardRevenueSummary(
      [
        row({ id: "today-start", payment_completed_at: "2026-05-13T22:00:00.000Z", amount_paid_cents: 10_000 }),
        row({ id: "before-today", payment_completed_at: "2026-05-13T21:59:59.999Z", amount_paid_cents: 20_000 }),
        row({ id: "today-later", payment_completed_at: "2026-05-14T08:00:00.000Z", amount_paid_cents: 30_000 }),
      ],
      NOW,
    );

    expect(summary.todayStartIso).toBe("2026-05-13T22:00:00.000Z");
    expect(summary.revenueTodayZar).toBe(400);
    expect(summary.paidBookingsToday).toBe(2);
    expect(summary.revenueMonthZar).toBe(600);
    expect(summary.paidBookingsMonth).toBe(3);
  });

  it("uses Johannesburg month boundaries for month-to-date revenue", () => {
    const summary = computeAdminDashboardRevenueSummary(
      [
        row({ id: "month-start", payment_completed_at: "2026-04-30T22:00:00.000Z", amount_paid_cents: 10_000 }),
        row({ id: "before-month", payment_completed_at: "2026-04-30T21:59:59.999Z", amount_paid_cents: 20_000 }),
      ],
      NOW,
    );

    expect(summary.monthStartIso).toBe("2026-04-30T22:00:00.000Z");
    expect(summary.revenueMonthZar).toBe(100);
    expect(summary.paidBookingsMonth).toBe(1);
  });

  it("computes rolling paid-booking average from eligible payment timestamps only", () => {
    const summary = computeAdminDashboardRevenueSummary(
      [
        row({ id: "a", payment_completed_at: "2026-05-14T08:00:00.000Z", amount_paid_cents: 10_000 }),
        row({ id: "b", payment_completed_at: "2026-05-13T08:00:00.000Z", amount_paid_cents: 30_000 }),
        row({ id: "refunded", payment_completed_at: "2026-05-14T08:00:00.000Z", amount_paid_cents: 90_000, refund_status: "full" }),
      ],
      NOW,
    );

    expect(summary.totalPaidBookingsWindow).toBe(2);
    expect(summary.avgBookingValueZar).toBe(200);
  });

  it("keeps monthly child rows out of today month and rolling aggregates", () => {
    const summary = computeAdminDashboardRevenueSummary(
      [
        row({ id: "prepaid", payment_completed_at: "2026-05-14T08:00:00.000Z", amount_paid_cents: 50_000 }),
        row({
          id: "monthly-child",
          payment_completed_at: "2026-05-14T08:00:00.000Z",
          amount_paid_cents: 50_000,
          billing_type: "recurring_invoice",
          is_monthly_billing_booking: true,
          monthly_invoice_id: "invoice-1",
        }),
      ],
      NOW,
    );

    expect(summary.revenueTodayZar).toBe(500);
    expect(summary.revenueMonthZar).toBe(500);
    expect(summary.totalPaidBookingsWindow).toBe(1);
  });
});
