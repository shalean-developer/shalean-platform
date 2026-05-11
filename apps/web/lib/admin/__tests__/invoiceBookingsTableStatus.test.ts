import { describe, expect, it } from "vitest";
import { describeBookingOperationalState } from "@/lib/booking/describeBookingOperationalState";

describe("InvoiceBookingsTable live status label", () => {
  it("uses describeBookingOperationalState displayBadge instead of raw bookings.status token", () => {
    const row: Record<string, unknown> = {
      id: "00000000-0000-4000-8000-0000000000aa",
      status: "pending",
      dispatch_status: "offered",
      cleaner_id: null,
      payment_completed_at: new Date().toISOString(),
    };
    const op = describeBookingOperationalState({ row, viewer: "admin" });
    expect(op.displayBadge).toBeTruthy();
    expect(op.displayBadge).not.toBe("pending");
  });
});
