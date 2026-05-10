import { describe, expect, it } from "vitest";
import { bookingPayableForWeeklyBatch, type BookingRowForWeeklyBatchEligibility } from "@/lib/payout/bookingPayableForWeeklyBatch";

function invMap(pairs: [string, string][]): Map<string, string> {
  return new Map(pairs);
}

const basePrepaid: BookingRowForWeeklyBatchEligibility = {
  status: "completed",
  billing_type: "prepaid",
  is_monthly_billing_booking: false,
  monthly_invoice_id: null,
  payment_status: "success",
  cleaner_payout_cents: 5000,
};

const baseMonthlySettled: BookingRowForWeeklyBatchEligibility = {
  status: "completed",
  billing_type: "recurring_invoice",
  is_monthly_billing_booking: true,
  monthly_invoice_id: "11111111-1111-4111-8111-111111111111",
  payment_status: "success",
  payout_status: "eligible",
  payout_frozen_cents: 4000,
  cleaner_payout_cents: 4000,
};

describe("bookingPayableForWeeklyBatch", () => {
  it("allows prepaid checkout when payment is success", () => {
    expect(bookingPayableForWeeklyBatch(basePrepaid, new Map()).payable).toBe(true);
  });

  it("allows prepaid when payment is paid or succeeded", () => {
    expect(bookingPayableForWeeklyBatch({ ...basePrepaid, payment_status: "paid" }, new Map()).payable).toBe(true);
    expect(bookingPayableForWeeklyBatch({ ...basePrepaid, payment_status: "succeeded" }, new Map()).payable).toBe(true);
  });

  it("rejects prepaid when payment pending or pending_monthly", () => {
    expect(bookingPayableForWeeklyBatch({ ...basePrepaid, payment_status: "pending" }, new Map()).payable).toBe(false);
    expect(bookingPayableForWeeklyBatch({ ...basePrepaid, payment_status: "pending_monthly" }, new Map()).payable).toBe(
      false,
    );
  });

  it("rejects zero or missing cleaner payout cents", () => {
    expect(bookingPayableForWeeklyBatch({ ...basePrepaid, cleaner_payout_cents: 0 }, new Map()).payable).toBe(false);
    expect(bookingPayableForWeeklyBatch({ ...basePrepaid, cleaner_payout_cents: null }, new Map()).payable).toBe(false);
  });

  it("rejects when refund signals set", () => {
    expect(
      bookingPayableForWeeklyBatch({ ...basePrepaid, refunded_at: "2026-01-01T00:00:00.000Z" }, new Map()).payable,
    ).toBe(false);
    expect(bookingPayableForWeeklyBatch({ ...basePrepaid, refund_status: "partial" }, new Map()).payable).toBe(false);
  });

  it("allows monthly accrual when invoice paid and settlement columns set", () => {
    const mid = String(baseMonthlySettled.monthly_invoice_id);
    const m = invMap([[mid, "paid"]]);
    expect(bookingPayableForWeeklyBatch(baseMonthlySettled, m).payable).toBe(true);
  });

  it("rejects monthly when invoice not paid", () => {
    const mid = String(baseMonthlySettled.monthly_invoice_id);
    expect(bookingPayableForWeeklyBatch(baseMonthlySettled, invMap([[mid, "sent"]])).payable).toBe(false);
  });

  it("rejects monthly when invoice row missing from map", () => {
    expect(bookingPayableForWeeklyBatch(baseMonthlySettled, new Map()).payable).toBe(false);
  });

  it("rejects monthly when payout_status not eligible or frozen missing", () => {
    const mid = String(baseMonthlySettled.monthly_invoice_id);
    const m = invMap([[mid, "paid"]]);
    expect(bookingPayableForWeeklyBatch({ ...baseMonthlySettled, payout_status: "pending" }, m).payable).toBe(false);
    expect(bookingPayableForWeeklyBatch({ ...baseMonthlySettled, payout_frozen_cents: null }, m).payable).toBe(false);
  });

  it("rejects accrual when monthly_invoice_id missing", () => {
    expect(
      bookingPayableForWeeklyBatch(
        {
          ...baseMonthlySettled,
          monthly_invoice_id: null,
          billing_type: "recurring_invoice",
        },
        new Map(),
      ).payable,
    ).toBe(false);
  });

  it("rejects non-completed status", () => {
    expect(bookingPayableForWeeklyBatch({ ...basePrepaid, status: "assigned" }, new Map()).payable).toBe(false);
  });
});
