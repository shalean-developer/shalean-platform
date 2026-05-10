import { describe, expect, it } from "vitest";
import { buildBookingEvent } from "@/lib/booking/bookingEvents";

describe("buildBookingEvent", () => {
  it("builds deterministic idempotency keys for the same logical inputs", () => {
    const a = buildBookingEvent({
      type: "booking.payment_succeeded",
      bookingId: "b1",
      actor: "paystack",
      externalRef: "ref:abc",
      metadata: { x: 1 },
    });
    const b = buildBookingEvent({
      type: "booking.payment_succeeded",
      bookingId: "b1",
      actor: "paystack",
      externalRef: "ref:abc",
      metadata: { x: 2 },
    });
    expect(a.idempotencyKey).toBe(b.idempotencyKey);
    expect(a.idempotencyKey).toBe("booking.payment_succeeded:b1:paystack:ref_abc");
  });

  it("sanitizes colons in externalRef segments", () => {
    const e = buildBookingEvent({
      type: "booking.started",
      bookingId: "bid",
      actor: "cleaner",
      externalRef: "a:b:c",
    });
    expect(e.idempotencyKey.endsWith(":a_b_c")).toBe(true);
  });

  it("uses none when externalRef is empty", () => {
    const e = buildBookingEvent({
      type: "booking.completed",
      bookingId: "b2",
      actor: "cleaner",
      externalRef: null,
    });
    expect(e.idempotencyKey).toBe("booking.completed:b2:cleaner:none");
  });
});
