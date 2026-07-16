import { describe, expect, it } from "vitest";
import { mapBookingRow } from "@/lib/dashboard/bookingUtils";
import { customerPaymentRowDisplay, isMonthlyBilledBookingRow } from "@/lib/dashboard/customerPaymentDisplay";
import type { BookingRow } from "@/lib/dashboard/types";

function dashboardFromRaw(raw: BookingRow) {
  return mapBookingRow(raw);
}

function raw(overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    id: "b1",
    service: "Standard",
    date: "2026-07-01",
    time: "10:00",
    location: "1 Main St",
    total_paid_zar: 400,
    amount_paid_cents: 40_000,
    currency: "ZAR",
    status: "assigned",
    booking_snapshot: null,
    created_at: "2026-06-01T10:00:00.000Z",
    paystack_reference: "ref-1",
    payment_completed_at: "2026-06-01T10:05:00.000Z",
    monthly_invoice_id: null,
    is_monthly_billing_booking: false,
    monthly_invoices: null,
    ...overrides,
  };
}

describe("isMonthlyBilledBookingRow", () => {
  it("detects pending_monthly payment_status", () => {
    expect(isMonthlyBilledBookingRow(raw({ payment_status: "pending_monthly" }))).toBe(true);
  });

  it("returns false for standard Paystack checkout", () => {
    expect(isMonthlyBilledBookingRow(raw())).toBe(false);
  });
});

describe("customerPaymentRowDisplay", () => {
  it("labels captured Paystack checkout as Paid", () => {
    const d = customerPaymentRowDisplay(dashboardFromRaw(raw()));
    expect(d.badgeLabel).toBe("Paid");
    expect(d.countsAsPaidTransaction).toBe(true);
  });

  it("does not count pending_monthly toward paid stats", () => {
    const d = customerPaymentRowDisplay(
      dashboardFromRaw(
        raw({
          payment_status: "pending_monthly",
          monthly_invoice_id: "inv-1",
          payment_completed_at: null,
          paystack_reference: "",
          amount_paid_cents: 0,
        }),
      ),
    );
    expect(d.badgeLabel).toBe("Monthly invoice");
    expect(d.countsAsPaidTransaction).toBe(false);
  });

  it("labels cancelled as Cancelled (not Refunded)", () => {
    const d = customerPaymentRowDisplay(dashboardFromRaw(raw({ status: "cancelled" })));
    expect(d.badgeLabel).toBe("Cancelled");
    expect(d.countsAsPaidTransaction).toBe(false);
  });

  it("labels pending_payment as Awaiting payment", () => {
    const d = customerPaymentRowDisplay(
      dashboardFromRaw(
        raw({
          status: "pending_payment",
          payment_completed_at: null,
          paystack_reference: "",
          amount_paid_cents: 0,
        }),
      ),
    );
    expect(d.badgeLabel).toBe("Awaiting payment");
    expect(d.countsAsPaidTransaction).toBe(false);
  });

  it("labels full refund distinctly from Paid when capture payment_status stays success (MODEL A)", () => {
    const d = customerPaymentRowDisplay(
      dashboardFromRaw(
        raw({
          payment_status: "success",
          refund_status: "full",
          refunded_at: "2026-06-02T10:00:00.000Z",
        }),
      ),
    );
    expect(d.badgeLabel).toBe("Fully refunded");
    expect(d.countsAsPaidTransaction).toBe(false);
  });

  it("still labels legacy payment_status=refunded as Fully refunded", () => {
    const d = customerPaymentRowDisplay(
      dashboardFromRaw(
        raw({
          payment_status: "refunded",
          refund_status: "full",
          refunded_at: "2026-06-02T10:00:00.000Z",
        }),
      ),
    );
    expect(d.badgeLabel).toBe("Fully refunded");
    expect(d.countsAsPaidTransaction).toBe(false);
  });

  it("labels partial refund", () => {
    const d = customerPaymentRowDisplay(
      dashboardFromRaw(
        raw({
          payment_status: "success",
          refund_status: "partial",
          refunded_at: "2026-06-02T10:00:00.000Z",
          amount_paid_cents: 20_000,
        }),
      ),
    );
    expect(d.badgeLabel).toBe("Partially refunded");
    expect(d.countsAsPaidTransaction).toBe(true);
  });
});
