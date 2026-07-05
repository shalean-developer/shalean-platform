import { describe, expect, it } from "vitest";
import { customerCancelBookingHint } from "@/lib/dashboard/customerCancelCopy";
import type { BookingRow } from "@/lib/dashboard/types";

function row(overrides: Partial<BookingRow> = {}): BookingRow {
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

describe("customerCancelBookingHint", () => {
  it("uses pay-as-you-go copy when not on monthly billing", () => {
    const hint = customerCancelBookingHint(row());
    expect(hint).toContain("cancelled");
    expect(hint.toLowerCase()).not.toContain("monthly invoice");
  });

  it("uses pre-payment copy for unpaid checkout", () => {
    const hint = customerCancelBookingHint(
      row({
        status: "pending_payment",
        payment_completed_at: null,
        amount_paid_cents: 0,
        paystack_reference: null,
      }),
    );
    expect(hint).toContain("before payment is taken");
  });

  it("uses monthly invoice copy when monthly_invoice_id is set", () => {
    const hint = customerCancelBookingHint(
      row({
        monthly_invoice_id: "inv-1",
        is_monthly_billing_booking: true,
        payment_status: "pending_monthly",
        payment_completed_at: null,
        amount_paid_cents: 0,
        paystack_reference: null,
      }),
    );
    expect(hint.toLowerCase()).toContain("monthly invoice");
  });

  it("uses next-invoice copy when monthly invoice is already finalized", () => {
    const hint = customerCancelBookingHint(
      row({
        monthly_invoice_id: "inv-1",
        is_monthly_billing_booking: true,
        payment_status: "pending_monthly",
        monthly_invoices: { status: "sent" },
      }),
    );
    expect(hint.toLowerCase()).toContain("next invoice");
  });
});
