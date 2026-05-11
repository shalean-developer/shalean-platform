import { describe, expect, it } from "vitest";
import { bookingRowToPaymentSummary } from "@/lib/payments/bookingPaymentSummary";

const baseRow = {
  id: "00000000-0000-4000-8000-00000000aaaa",
  customer_email: "customer@example.com",
  service: "standard-cleaning",
  rooms: 2,
  bathrooms: 1,
  extras: [],
  total_price: 800,
  total_paid_zar: 800,
  status: "pending_payment" as const,
  payment_completed_at: null,
};

describe("bookingRowToPaymentSummary — selected cleaner display", () => {
  it("exposes selectedCleanerId from row when snapshot omits cleaner_id", () => {
    const summary = bookingRowToPaymentSummary({
      ...baseRow,
      selected_cleaner_id: "22222222-2222-4222-8222-222222222222",
      booking_snapshot: { v: 1 },
    });
    expect(summary.selectedCleanerId).toBe("22222222-2222-4222-8222-222222222222");
  });

  it("returns Princess's display name when the intake snapshot persisted it", () => {
    const summary = bookingRowToPaymentSummary({
      ...baseRow,
      booking_snapshot: {
        v: 1,
        cleaner_id: "11111111-1111-4111-8111-111111111111",
        cleaner_name: "Princess Saidi",
      },
    });
    expect(summary.cleanerName).toBe("Princess Saidi");
    expect(summary.priceZar).toBe(800);
  });

  it("falls back to a stable placeholder when only the cleaner_name is set", () => {
    const summary = bookingRowToPaymentSummary({
      ...baseRow,
      booking_snapshot: {
        v: 1,
        cleaner_name: "Selected cleaner",
      },
    });
    expect(summary.cleanerName).toBe("Selected cleaner");
  });

  it("returns null cleanerName when neither selected_cleaner_id nor cleaner_name is on the snapshot", () => {
    const summary = bookingRowToPaymentSummary({
      ...baseRow,
      booking_snapshot: { v: 1 },
    });
    expect(summary.cleanerName).toBeNull();
  });

  it("ignores blank / whitespace cleaner_name (treats as auto-assign)", () => {
    const summary = bookingRowToPaymentSummary({
      ...baseRow,
      booking_snapshot: { v: 1, cleaner_name: "   " },
    });
    expect(summary.cleanerName).toBeNull();
  });
});
