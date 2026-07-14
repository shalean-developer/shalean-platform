import { describe, expect, it } from "vitest";
import {
  bookingHasPendingCollectedCashAnomaly,
  bookingIsCustomerPaymentSettled,
} from "@/lib/booking/bookingPaymentSettlementState";

describe("bookingPaymentSettlementState", () => {
  it("treats authoritative payment_status as settled", () => {
    expect(
      bookingIsCustomerPaymentSettled({
        payment_status: "success",
        status: "pending",
        amount_paid_cents: 0,
      }),
    ).toBe(true);
  });

  it("does not treat pending_payment positive cents as settled", () => {
    expect(
      bookingIsCustomerPaymentSettled({
        payment_status: "pending",
        status: "pending_payment",
        amount_paid_cents: 12_000,
        total_paid_zar: 120,
      }),
    ).toBe(false);
  });

  it("allows historical cash compatibility after leaving pending_payment", () => {
    expect(
      bookingIsCustomerPaymentSettled({
        payment_status: null,
        status: "assigned",
        amount_paid_cents: 12_000,
      }),
    ).toBe(true);
  });

  it("flags pending collected-cash anomalies", () => {
    expect(
      bookingHasPendingCollectedCashAnomaly({
        status: "pending_payment",
        payment_status: "pending",
        amount_paid_cents: 5000,
      }),
    ).toBe(true);
    expect(
      bookingHasPendingCollectedCashAnomaly({
        status: "pending_payment",
        payment_status: "pending",
        amount_paid_cents: 0,
      }),
    ).toBe(false);
  });
});
