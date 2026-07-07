import { describe, expect, it } from "vitest";
import {
  computeOfficeAnalyticsSummary,
  pctChange,
  type OfficeAnalyticsBookingRow,
} from "@/lib/admin/officeAnalytics";

const NOW = new Date("2026-06-19T10:00:00.000Z");

function row(overrides: Partial<OfficeAnalyticsBookingRow>): OfficeAnalyticsBookingRow {
  return {
    id: "booking-1",
    status: "completed",
    payment_status: "success",
    payment_completed_at: "2026-06-18T08:00:00.000Z",
    total_paid_zar: 500,
    amount_paid_cents: 50_000,
    refunded_at: null,
    refund_status: null,
    billing_type: "prepaid",
    is_monthly_billing_booking: false,
    monthly_invoice_id: null,
    created_at: "2026-06-18T07:00:00.000Z",
    updated_at: "2026-06-18T07:00:00.000Z",
    service: "deep-cleaning",
    service_slug: "deep-cleaning",
    user_id: "user-1",
    is_recurring_generated: false,
    ...overrides,
  };
}

describe("pctChange", () => {
  it("computes rounded percentage deltas", () => {
    expect(pctChange(110, 100)).toBe(10);
    expect(pctChange(90, 100)).toBe(-10);
    expect(pctChange(5, 0)).toBe(100);
    expect(pctChange(0, 0)).toBeNull();
  });
});

describe("computeOfficeAnalyticsSummary", () => {
  it("aggregates paid revenue, bookings, service mix, and trends from real booking rows", () => {
    const summary = computeOfficeAnalyticsSummary(
      [
        row({
          id: "current-1",
          user_id: "returning-user",
          service_slug: "regular-cleaning",
          amount_paid_cents: 100_000,
          payment_completed_at: "2026-06-10T08:00:00.000Z",
          created_at: "2026-06-10T07:00:00.000Z",
        }),
        row({
          id: "current-2",
          user_id: "new-user",
          service_slug: "deep-cleaning",
          amount_paid_cents: 50_000,
          payment_completed_at: "2026-06-12T08:00:00.000Z",
          created_at: "2026-06-12T07:00:00.000Z",
        }),
        row({
          id: "prev-1",
          user_id: "prev-only",
          amount_paid_cents: 20_000,
          payment_completed_at: "2026-05-20T08:00:00.000Z",
          created_at: "2026-05-20T07:00:00.000Z",
        }),
        row({
          id: "recurring-1",
          user_id: "returning-user",
          service_slug: "regular-cleaning",
          is_recurring_generated: true,
          amount_paid_cents: 30_000,
          payment_completed_at: "2026-06-15T08:00:00.000Z",
          created_at: "2026-06-15T07:00:00.000Z",
        }),
        row({
          id: "cancelled-1",
          status: "cancelled",
          payment_status: "pending",
          payment_completed_at: null,
          amount_paid_cents: 0,
          total_paid_zar: 0,
          created_at: "2026-06-14T07:00:00.000Z",
          updated_at: "2026-06-14T09:00:00.000Z",
        }),
      ],
      ["returning-user"],
      NOW,
    );

    expect(summary.kpis.totalRevenueZar).toBe(1800);
    expect(summary.kpis.totalBookings).toBe(3);
    expect(summary.kpis.avgBookingValueZar).toBe(600);
    expect(summary.kpis.customerRetentionPct).toBe(50);
    expect(summary.servicePopularity).toEqual([
      expect.objectContaining({ name: "Regular Cleaning", count: 2 }),
      expect.objectContaining({ name: "Deep Cleaning", count: 1 }),
    ]);
    expect(summary.bookingTrends.find((t) => t.label === "New bookings")?.value).toBe(4);
    expect(summary.bookingTrends.find((t) => t.label === "Recurring visits")?.value).toBe(1);
    expect(summary.bookingTrends.find((t) => t.label === "Cancellations")?.value).toBe(1);
    // Default window is the trailing 30 days → weekly buckets.
    expect(summary.range.granularity).toBe("week");
    expect(Array.isArray(summary.revenueChart)).toBe(true);
    expect(summary.revenueChart.length).toBe(Math.ceil(summary.range.days / 7));
  });

  it("honours an explicit window and picks daily buckets for short ranges", () => {
    const summary = computeOfficeAnalyticsSummary(
      [
        row({
          id: "in-window",
          amount_paid_cents: 40_000,
          payment_completed_at: "2026-06-17T08:00:00.000Z",
          created_at: "2026-06-17T07:00:00.000Z",
        }),
        row({
          id: "outside-window",
          amount_paid_cents: 90_000,
          payment_completed_at: "2026-05-01T08:00:00.000Z",
          created_at: "2026-05-01T07:00:00.000Z",
        }),
      ],
      [],
      NOW,
      {
        startMs: Date.parse("2026-06-13T00:00:00+02:00"),
        endMs: Date.parse("2026-06-20T00:00:00+02:00"),
      },
    );

    expect(summary.range.granularity).toBe("day");
    expect(summary.range.days).toBe(7);
    expect(summary.revenueChart.length).toBe(7);
    // Only the booking paid inside the 7-day window contributes.
    expect(summary.kpis.totalRevenueZar).toBe(400);
    expect(summary.kpis.totalBookings).toBe(1);
  });

  it("uses customer_id when present (production bookings schema)", () => {
    const summary = computeOfficeAnalyticsSummary(
      [
        row({
          id: "current-1",
          user_id: null,
          customer_id: "returning-user",
          payment_completed_at: "2026-06-10T08:00:00.000Z",
        }),
        row({
          id: "current-2",
          user_id: null,
          customer_id: "new-user",
          payment_completed_at: "2026-06-12T08:00:00.000Z",
        }),
      ],
      ["returning-user"],
      NOW,
    );

    expect(summary.kpis.customerRetentionPct).toBe(50);
  });
});
