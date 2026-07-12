import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CUSTOMER_CANCELLABLE_BOOKING_STATUSES } from "@shalean/types";
import {
  canCancelBooking,
  canRebookBooking,
  canRescheduleBooking,
  isRescheduleCrossMonthBlocked,
} from "../modifyEligibility";

describe("modifyEligibility contract", () => {
  it("canCancel is true for every CUSTOMER_CANCELLABLE status without timestamps", () => {
    for (const status of CUSTOMER_CANCELLABLE_BOOKING_STATUSES) {
      assert.equal(
        canCancelBooking({ status }),
        true,
        `expected canCancel for ${status}`,
      );
    }
  });

  it("canCancel is false for non-cancellable statuses", () => {
    for (const status of ["in_progress", "completed", "cancelled", "failed", "pending_payment"]) {
      assert.equal(canCancelBooking({ status }), false, `expected !canCancel for ${status}`);
    }
  });

  it("started_at blocks cancel and reschedule", () => {
    assert.equal(
      canCancelBooking({ status: "assigned", started_at: "2026-07-11T10:00:00Z" }),
      false,
    );
    assert.equal(
      canRescheduleBooking({ status: "assigned", started_at: "2026-07-11T10:00:00Z" }),
      false,
    );
  });

  it("en_route_at blocks reschedule but NOT cancel", () => {
    const row = { status: "assigned", en_route_at: "2026-07-11T09:00:00Z" };
    assert.equal(canRescheduleBooking(row), false);
    assert.equal(canCancelBooking(row), true);
  });

  it("canRebook only for completed or cancelled (canonical)", () => {
    assert.equal(canRebookBooking({ status: "completed" }), true);
    assert.equal(canRebookBooking({ status: "cancelled" }), true);
    assert.equal(canRebookBooking({ status: "assigned" }), false);
    assert.equal(canRebookBooking({ status: "pending" }), false);
    assert.equal(canRebookBooking({ status: "in_progress" }), false);
    assert.equal(canRebookBooking({ status: "failed" }), false);
  });

  it("normalizes status case for cancel/reschedule/rebook", () => {
    assert.equal(canCancelBooking({ status: "Assigned" }), true);
    assert.equal(canRescheduleBooking({ status: "PENDING_ASSIGNMENT" }), true);
    assert.equal(canRebookBooking({ status: "Completed" }), true);
    assert.equal(canRebookBooking({ status: "CANCELLED" }), true);
  });

  it("cross-month block only for monthly-linked bookings", () => {
    assert.equal(
      isRescheduleCrossMonthBlocked(
        { date: "2026-07-15", monthly_invoice_id: "inv-1" },
        "2026-08-01",
      ),
      true,
    );
    assert.equal(
      isRescheduleCrossMonthBlocked(
        { date: "2026-07-15", payment_status: "pending_monthly" },
        "2026-07-28",
      ),
      false,
    );
    assert.equal(
      isRescheduleCrossMonthBlocked(
        { date: "2026-07-15", is_monthly_billing_booking: true },
        "2026-06-30",
      ),
      true,
    );
    assert.equal(
      isRescheduleCrossMonthBlocked({ date: "2026-07-15" }, "2026-08-01"),
      false,
    );
  });
});
