import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { checkoutPriceSnapshotFromLegacyPriceSnapshotV1 } from "@/lib/booking/priceSnapshotBooking";

describe("first-30-day recurring prepayment contract", () => {
  it("preserves the aggregate charge and the separate per-visit price in checkout metadata", () => {
    const snapshot = checkoutPriceSnapshotFromLegacyPriceSnapshotV1({
      v: 1,
      currency: "ZAR",
      total_price: 7_166,
      pay_total_zar: 7_166,
      base_price: 3_833,
      server_computed_total: 7_666,
      payment_scope: "recurring_first_30_days",
      per_visit_price_zar: 3_833,
      prepaid_visit_count: 2,
      prepaid_occurrence_dates: ["2026-09-24", "2026-10-08"],
    });

    expect(snapshot).toMatchObject({
      total_zar: 7_166,
      payment_scope: "recurring_first_30_days",
      per_visit_price_zar: 3_833,
      prepaid_visit_count: 2,
    });
  });

  it("keeps covered generated visits paid and skips duplicate payment recovery", () => {
    const source = readFileSync(
      resolve(__dirname, "insertRecurringOccurrenceBooking.ts"),
      "utf8",
    );
    expect(source).toContain("findReservedRecurringPrepaymentAllocation");
    expect(source).toContain('payment_status: prepaidAllocation ? ("success" as const)');
    expect(source).toContain("if (!prepaidAllocation)");
    expect(source).toContain("scheduleBookingPaymentRecoveryJobs");
  });

  it("routes child refunds to the package and keeps package refunds cumulative", () => {
    const source = readFileSync(
      resolve(__dirname, "../booking/refund/refundBookingPayment.ts"),
      "utf8",
    );
    expect(source).toContain("recurring_prepaid_child_use_package_refund");
    expect(source).toContain("paid_package_zar");
    expect(source).toContain("refunded_cents: workflow.refunded_cents");
  });

  it("charges the exact package total instead of one visit", () => {
    const confirmSource = readFileSync(
      resolve(__dirname, "../../app/api/booking-v2/confirm/route.ts"),
      "utf8",
    );
    const paymentSource = readFileSync(
      resolve(__dirname, "../../src/features/booking-v2/steps/Step4Payment.tsx"),
      "utf8",
    );
    expect(confirmSource).toContain(
      "const checkoutSubtotalZar = recurringPrepaymentQuote?.grossPackageZar ?? preDiscountTotalZar",
    );
    expect(confirmSource).toContain("const grossZar = checkoutSubtotalZar");
    expect(paymentSource).toContain(
      "const checkoutSubtotal = recurringPrepayment?.grossPackageZar ?? baseTotal",
    );
    expect(paymentSource).toContain('values.bookingType === "recurring" ? "Pay first 30 days"');
  });

  it("creates every later cycle as a complete rolling package with no per-visit fallback", () => {
    const occurrenceSource = readFileSync(
      resolve(__dirname, "insertRecurringOccurrenceBooking.ts"),
      "utf8",
    );
    expect(occurrenceSource).toContain('scope: "rolling_30_days"');
    expect(occurrenceSource).toContain("renewalQuote?.grossPackageZar ?? priceZar");
    expect(occurrenceSource).toContain('error: "recurring_package_schedule_invalid"');
    expect(occurrenceSource).toContain("upsertPendingRecurringPrepayment");
  });

  it("never auto-charges a package after its recurring plan stops being active", () => {
    const chargeSource = readFileSync(
      resolve(__dirname, "../../app/api/cron/charge-recurring-bookings/route.ts"),
      "utf8",
    );
    expect(chargeSource).toContain('.select("paystack_authorization_code, status")');
    expect(chargeSource).toContain('if (recurringStatus !== "active")');
    expect(chargeSource).toContain("recurring_package_charge_skipped_inactive_plan");
  });

  it("tells customers that complete 30-day packages renew automatically", () => {
    const reviewSource = readFileSync(
      resolve(__dirname, "../../src/features/booking-v2/steps/Step3Review.tsx"),
      "utf8",
    );
    const paymentSource = readFileSync(
      resolve(__dirname, "../../src/features/booking-v2/steps/Step4Payment.tsx"),
      "utf8",
    );
    expect(reviewSource).toContain("each 30-day billing cycle together");
    expect(paymentSource).toContain("charge each complete 30-day visit package automatically");
    expect(reviewSource).not.toContain("Visits after that are billed separately");
    expect(paymentSource).not.toContain("each visit is billed separately");
  });
});
