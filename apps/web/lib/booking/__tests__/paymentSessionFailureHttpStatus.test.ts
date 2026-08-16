import { describe, expect, it } from "vitest";
import { paymentSessionFailureHttpStatus } from "@/lib/booking/paymentSessionFailureHttpStatus";

describe("paymentSessionFailureHttpStatus", () => {
  it("hard-stops checkout when the booking row cannot be found", () => {
    expect(
      paymentSessionFailureHttpStatus({
        errorCode: "PAYMENT_BOOKING_NOT_FOUND",
        retryable: false,
      }),
    ).toBe(401);
  });

  it("preserves retryable initialization failures as 503", () => {
    expect(
      paymentSessionFailureHttpStatus({
        errorCode: "PAYMENT_INITIALIZATION_FAILED",
        retryable: true,
      }),
    ).toBe(503);
  });

  it("keeps access denied and completed-payment failures distinct", () => {
    expect(paymentSessionFailureHttpStatus({ errorCode: "PAYMENT_ACCESS_DENIED" })).toBe(403);
    expect(paymentSessionFailureHttpStatus({ errorCode: "PAYMENT_ALREADY_COMPLETED" })).toBe(409);
  });
});
