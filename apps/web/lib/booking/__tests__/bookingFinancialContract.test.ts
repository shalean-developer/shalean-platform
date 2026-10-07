import { describe, expect, it } from "vitest";
import {
  BOOKING_FINANCIAL_FIELD_AUTHORITY,
  canonicalCollectedCashCents,
  canonicalServiceValueCents,
  classifyBookingFinancialMode,
  isMonthlyBillingContext,
  legacyTotalPaidZarIsAuthoritative,
} from "@/lib/booking/bookingFinancialContract";

describe("AUDIT-02A01 Piece 1 financial contract", () => {
  it("never treats total_paid_zar as universal financial authority", () => {
    expect(legacyTotalPaidZarIsAuthoritative()).toBe(false);
    expect(BOOKING_FINANCIAL_FIELD_AUTHORITY.collectedCash.canonical).toBe(
      "amount_paid_cents",
    );
    expect(BOOKING_FINANCIAL_FIELD_AUTHORITY.serviceValue.canonical).toBe(
      "booking_line_items_then_total_price",
    );
  });

  it("classifies pending_monthly as monthly draft, not collected-cash settlement", () => {
    const row = {
      payment_status: "pending_monthly",
      status: "assigned",
      amount_paid_cents: 0,
      total_paid_zar: 850,
      total_price: 850,
      monthly_invoice_status: "draft",
    };

    expect(isMonthlyBillingContext(row)).toBe(true);
    expect(classifyBookingFinancialMode(row)).toBe("monthly_draft");
    expect(canonicalCollectedCashCents(row)).toBe(0);
  });

  it("uses eligible line items before total_price for service value", () => {
    expect(
      canonicalServiceValueCents({
        booking: { total_price: 1000, total_paid_zar: 800 },
        eligibleLineItemsSubtotalCents: 100_000,
      }),
    ).toBe(100_000);

    expect(
      canonicalServiceValueCents({
        booking: { total_price: 1000, total_paid_zar: 800 },
      }),
    ).toBe(100_000);
  });

  it("falls back to total_price when the line-item subtotal is unavailable", () => {
    expect(
      canonicalServiceValueCents({
        booking: { total_price: 725 },
        eligibleLineItemsSubtotalCents: null,
      }),
    ).toBe(72_500);

    expect(
      canonicalServiceValueCents({
        booking: { total_price: 725 },
        eligibleLineItemsSubtotalCents: undefined,
      }),
    ).toBe(72_500);
  });

  it("keeps checkout payable and collected cash separate", () => {
    const row = {
      status: "pending_payment",
      payment_status: "pending",
      total_price: 467,
      amount_paid_cents: 0,
      total_paid_cents: 0,
      total_paid_zar: 467,
    };

    expect(classifyBookingFinancialMode(row)).toBe("checkout_unsettled");
    expect(canonicalCollectedCashCents(row)).toBe(0);
    expect(canonicalServiceValueCents({ booking: row })).toBe(46_700);
  });

  it("classifies R0 covered settlement without inventing collected cash", () => {
    const row = {
      status: "pending",
      payment_status: "success",
      total_price: 0,
      amount_paid_cents: 0,
      total_paid_cents: 0,
      total_paid_zar: 0,
    };

    expect(classifyBookingFinancialMode(row)).toBe("covered_zero");
    expect(canonicalCollectedCashCents(row)).toBe(0);
  });

  it("uses invoice state for monthly obligation state", () => {
    expect(
      classifyBookingFinancialMode({
        payment_status: "pending_monthly",
        monthly_invoice_id: "invoice-id",
        monthly_invoice_status: "sent",
      }),
    ).toBe("monthly_sent");

    expect(
      classifyBookingFinancialMode({
        payment_status: "pending_monthly",
        monthly_invoice_id: "invoice-id",
        monthly_invoice_status: "paid",
      }),
    ).toBe("monthly_paid");

    expect(
      classifyBookingFinancialMode({
        payment_status: "pending_monthly",
        monthly_invoice_id: "invoice-id",
        monthly_invoice_status: "refunded",
      }),
    ).toBe("monthly_refunded");
  });
});
