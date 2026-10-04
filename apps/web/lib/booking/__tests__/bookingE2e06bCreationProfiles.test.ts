import { describe, expect, it } from "vitest";
import { bookingCreationLifecyclePatch } from "@/lib/booking/bookingCreationProfiles";

describe("BOOKING-E2E-06B typed creation lifecycle profiles", () => {
  it("preserves customer checkout pending-payment semantics", () => {
    expect(bookingCreationLifecyclePatch("customer_pending_payment")).toEqual({
      status: "pending_payment", dispatch_status: "searching", amount_paid_cents: 0, currency: "ZAR",
    });
  });

  it("preserves monthly recurring billing semantics", () => {
    expect(bookingCreationLifecyclePatch("recurring_monthly")).toMatchObject({
      status: "pending", dispatch_status: "searching", payment_status: "pending_monthly",
      is_recurring_generated: true, is_monthly_billing_booking: true, billing_type: "recurring_invoice",
    });
  });

  it("distinguishes unpaid and prepaid recurring occurrences", () => {
    expect(bookingCreationLifecyclePatch("recurring_unpaid")).toMatchObject({ status: "pending_payment", payment_status: "pending" });
    expect(bookingCreationLifecyclePatch("recurring_prepaid")).toMatchObject({ status: "pending", payment_status: "success", billing_type: "prepaid" });
  });
  it("preserves Paystack paid assignment transitions", () => {
    expect(bookingCreationLifecyclePatch("paystack_paid")).toEqual({ status: "pending", dispatch_status: "searching" });
    expect(bookingCreationLifecyclePatch("paystack_paid_selected_cleaner")).toEqual({ status: "pending_assignment", dispatch_status: "searching" });
  });

  it("preserves admin billing-mode defaults without owning dynamic status or assignment", () => {
    expect(bookingCreationLifecyclePatch("admin_payment_received")).toEqual({ is_monthly_billing_booking: false, payment_status: "pending", billing_type: "per_booking" });
    expect(bookingCreationLifecyclePatch("admin_monthly")).toEqual({ is_monthly_billing_booking: true, payment_status: "pending_monthly", billing_type: "recurring_invoice" });
  });
});
