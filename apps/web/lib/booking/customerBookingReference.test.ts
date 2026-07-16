import { describe, expect, it } from "vitest";
import {
  displayCustomerBookingReference,
  displayCustomerPaymentReference,
  formatCustomerBookingTotalPaid,
  isCustomerBookingReference,
  customerAccountBookingReference,
  resolveCustomerTotalPaidZar,
} from "@/lib/booking/customerBookingReference";

describe("customerBookingReference", () => {
  it("accepts SHL-BK references", () => {
    expect(isCustomerBookingReference("SHL-BK-000001")).toBe(true);
    expect(displayCustomerBookingReference({ bookingReference: "shl-bk-000042" })).toBe("SHL-BK-000042");
  });

  it("rejects Paystack temp refs", () => {
    expect(isCustomerBookingReference("bv2_1710000000_abc123")).toBe(false);
    expect(displayCustomerBookingReference({ bookingReference: "bv2_1710000000_abc123" })).toBeNull();
  });

  it("formats customer payment refs as PAY-######", () => {
    expect(displayCustomerPaymentReference("bv2_1710000000_81cp6m")).toBe("PAY-81CP6M");
    expect(displayCustomerPaymentReference("PAY-81CP6M")).toBe("PAY-81CP6M");
    expect(displayCustomerPaymentReference("")).toBe("—");
  });

  it("formats totals without a space after R", () => {
    expect(formatCustomerBookingTotalPaid(580)).toBe("R580");
    expect(formatCustomerBookingTotalPaid(1250)).toBe("R1\u00a0250");
  });

  it("uses SHL-BK ref on account pages and rejects Paystack refs", () => {
    expect(
      customerAccountBookingReference({
        bookingId: "00000000-0000-4000-8000-00000000aaaa",
        bookingReference: "SHL-BK-000042",
      }),
    ).toBe("SHL-BK-000042");
    expect(
      customerAccountBookingReference({
        bookingId: "00000000-0000-4000-8000-00000000aaaa",
        bookingReference: "bv2_1781694927362_585pib",
      }),
    ).toBe("00000000");
  });

  it("prefers Paystack amountCents over snapshot total_zar for Total paid", () => {
    expect(
      resolveCustomerTotalPaidZar({
        amountCents: 123_000,
        snapshotTotalZar: 1885,
      }),
    ).toBe(1230);
    expect(
      resolveCustomerTotalPaidZar({
        amountCents: null,
        snapshotTotalZar: 1602,
      }),
    ).toBe(1602);
    expect(resolveCustomerTotalPaidZar({ amountCents: 0, snapshotTotalZar: null })).toBeNull();
  });
});
