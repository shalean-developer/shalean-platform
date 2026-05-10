import { describe, expect, it } from "vitest";
import {
  bookingPaidCustomerSignalsPresent,
  bookingRequiresPersistedEarningsBeforeCleanerNotify,
} from "@/lib/payout/adminBookingAssignmentEarningsGate";

describe("bookingRequiresPersistedEarningsBeforeCleanerNotify", () => {
  it("is true for paid prepaid solo assigned booking", () => {
    expect(
      bookingRequiresPersistedEarningsBeforeCleanerNotify({
        is_team_job: false,
        billing_type: "prepaid",
        status: "assigned",
        total_paid_zar: null,
        total_paid_cents: 50_000,
        amount_paid_cents: 50_000,
        payment_status: "paid",
      }),
    ).toBe(true);
  });

  it("is false for team jobs", () => {
    expect(
      bookingRequiresPersistedEarningsBeforeCleanerNotify({
        is_team_job: true,
        billing_type: "prepaid",
        status: "assigned",
        total_paid_cents: 50_000,
        payment_status: "paid",
      }),
    ).toBe(false);
  });

  it("is false when no paid customer signal", () => {
    expect(
      bookingRequiresPersistedEarningsBeforeCleanerNotify({
        is_team_job: false,
        billing_type: "prepaid",
        status: "assigned",
        total_paid_cents: null,
        amount_paid_cents: null,
        payment_status: null,
      }),
    ).toBe(false);
  });
});

describe("bookingPaidCustomerSignalsPresent", () => {
  it("detects amount_paid_cents", () => {
    expect(bookingPaidCustomerSignalsPresent({ total_paid_zar: null, total_paid_cents: null, amount_paid_cents: 100 })).toBe(
      true,
    );
  });
});
