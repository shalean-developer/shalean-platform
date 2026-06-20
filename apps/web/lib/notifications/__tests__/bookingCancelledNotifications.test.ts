import { describe, expect, it } from "vitest";
import { isDraftUnconfirmedCancellationBooking } from "@/lib/notifications/bookingCancelledNotifications";

describe("bookingCancelledNotifications", () => {
  it("skips abandoned pending_payment drafts without customer contact", () => {
    expect(
      isDraftUnconfirmedCancellationBooking({
        status: "pending_payment",
        amount_paid_cents: 0,
        customer_email: null,
        customer_phone: null,
        customer_name: null,
      }),
    ).toBe(true);
  });

  it("allows cancellation notifications when customer email exists", () => {
    expect(
      isDraftUnconfirmedCancellationBooking({
        status: "pending_payment",
        amount_paid_cents: 0,
        customer_email: "guest@example.com",
      }),
    ).toBe(false);
  });

  it("allows cancellation notifications for paid assigned bookings", () => {
    expect(
      isDraftUnconfirmedCancellationBooking({
        status: "assigned",
        amount_paid_cents: 12000,
        customer_email: "paid@example.com",
      }),
    ).toBe(false);
  });
});
