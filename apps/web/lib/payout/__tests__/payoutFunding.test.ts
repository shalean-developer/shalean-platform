import { describe, expect, it } from "vitest";
import { bookingFundingCollected, prepaidPaymentCollected } from "@/lib/payout/payoutFunding";

describe("payoutFunding", () => {
  it("treats successful prepaid customer payments as collected", () => {
    expect(prepaidPaymentCollected("success")).toBe(true);
    expect(prepaidPaymentCollected("paid")).toBe(true);
    expect(prepaidPaymentCollected("succeeded")).toBe(true);
    expect(prepaidPaymentCollected("pending_monthly")).toBe(false);
    expect(prepaidPaymentCollected("pending")).toBe(false);
  });

  it("requires a paid monthly invoice and successful booking settlement", () => {
    const invoices = new Map([["inv-1", "paid"]]);
    expect(
      bookingFundingCollected(
        {
          id: "booking-1",
          billing_type: "monthly_contract",
          is_monthly_billing_booking: true,
          monthly_invoice_id: "inv-1",
          payment_status: "success",
          refunded_at: null,
          refund_status: null,
        },
        invoices,
      ),
    ).toBe(true);

    expect(
      bookingFundingCollected(
        {
          id: "booking-2",
          billing_type: "monthly_contract",
          is_monthly_billing_booking: true,
          monthly_invoice_id: "inv-2",
          payment_status: "pending_monthly",
          refunded_at: null,
          refund_status: null,
        },
        new Map([["inv-2", "sent"]]),
      ),
    ).toBe(false);
  });

  it("never treats refunded earnings as funded", () => {
    expect(
      bookingFundingCollected(
        {
          id: "booking-3",
          billing_type: "prepaid",
          is_monthly_billing_booking: false,
          monthly_invoice_id: null,
          payment_status: "success",
          refunded_at: "2026-08-01T00:00:00Z",
          refund_status: "refunded",
        },
        new Map(),
      ),
    ).toBe(false);
  });
});
