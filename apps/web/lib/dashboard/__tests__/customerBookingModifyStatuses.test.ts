import { describe, expect, it } from "vitest";
import {
  CUSTOMER_CANCELLABLE_BOOKING_STATUSES,
  isCustomerCancellableBookingStatus,
  isCustomerReschedulableBookingStatus,
} from "@/lib/dashboard/customerBookingModifyStatuses";

describe("customerBookingModifyStatuses", () => {
  it("allows post-pay dispatch limbo statuses", () => {
    expect(CUSTOMER_CANCELLABLE_BOOKING_STATUSES.has("pending_assignment")).toBe(true);
    expect(CUSTOMER_CANCELLABLE_BOOKING_STATUSES.has("offered")).toBe(true);
  });

  it("rejects in-progress and terminal statuses", () => {
    expect(isCustomerCancellableBookingStatus("in_progress")).toBe(false);
    expect(isCustomerCancellableBookingStatus("completed")).toBe(false);
    expect(isCustomerReschedulableBookingStatus("cancelled")).toBe(false);
  });

  it("normalizes case for checks", () => {
    expect(isCustomerCancellableBookingStatus("Pending_Assignment")).toBe(true);
  });
});
