import { describe, expect, it } from "vitest";
import {
  evaluatePaymentRecoveryJobEligibility,
  hasSuccessfulPaystackPayment,
  isBookingUnpaidForPaymentRecovery,
} from "@/lib/booking/paymentRecoveryEmailGuards";
import { PAYMENT_RECOVERY_SKIP } from "@/lib/booking/paymentRecoverySkipReasons";

describe("paymentRecoveryEmailGuards", () => {
  it("detects unpaid pending_payment bookings", () => {
    expect(isBookingUnpaidForPaymentRecovery({ status: "pending_payment", payment_status: "pending" })).toBe(true);
    expect(isBookingUnpaidForPaymentRecovery({ status: "assigned", payment_status: "success", amount_paid_cents: 5000 })).toBe(
      false,
    );
  });

  it("detects successful Paystack payment signals", () => {
    expect(hasSuccessfulPaystackPayment({ payment_status: "success" })).toBe(true);
    expect(hasSuccessfulPaystackPayment({ status: "pending_payment", amount_paid_cents: 12000 })).toBe(false);
    expect(
      hasSuccessfulPaystackPayment({
        status: "assigned",
        payment_status: null,
        amount_paid_cents: 12000,
      }),
    ).toBe(true);
  });

  it("keeps unpaid pending bookings eligible for recovery even with anomalous cash columns", () => {
    expect(
      isBookingUnpaidForPaymentRecovery({
        status: "pending_payment",
        payment_status: "pending",
        amount_paid_cents: 12000,
      }),
    ).toBe(true);
  });

  it("skips reminders when booking is cancelled or paid", () => {
    expect(evaluatePaymentRecoveryJobEligibility({ status: "cancelled" }, "payment_reminder_1h")).toEqual({
      eligible: false,
      reason: PAYMENT_RECOVERY_SKIP.bookingCancelled,
      action: "cancel",
    });
    expect(
      evaluatePaymentRecoveryJobEligibility(
        { status: "pending", payment_status: "success", amount_paid_cents: 1000 },
        "payment_reminder_24h",
      ),
    ).toEqual({
      eligible: false,
      reason: PAYMENT_RECOVERY_SKIP.bookingPaid,
      action: "cancel",
    });
  });

  it("skips reminder jobs when booking already payment_expired", () => {
    expect(
      evaluatePaymentRecoveryJobEligibility({ status: "payment_expired", payment_status: "pending" }, "payment_reminder_1h"),
    ).toEqual({
      eligible: false,
      reason: PAYMENT_RECOVERY_SKIP.bookingAlreadyExpired,
      action: "skip",
    });
  });

  it("allows booking_payment_expired for payment_expired unpaid rows", () => {
    expect(
      evaluatePaymentRecoveryJobEligibility({ status: "payment_expired", payment_status: "pending" }, "booking_payment_expired"),
    ).toEqual({ eligible: true });
  });
});
