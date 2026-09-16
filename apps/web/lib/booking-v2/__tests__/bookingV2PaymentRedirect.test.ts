import { describe, expect, it } from "vitest";
import { bookingV2SuccessHref } from "@/lib/booking-v2/bookingV2PaymentRedirect";

describe("bookingV2PaymentRedirect", () => {
  it("builds account success URL with encoded reference", () => {
    expect(bookingV2SuccessHref("bv2_abc 123")).toBe(
      "/account/success?reference=bv2_abc%20123",
    );
  });

  it("carries the persisted booking id into payment recovery", () => {
    expect(bookingV2SuccessHref("bps_paid", "123e4567-e89b-42d3-a456-426614174000")).toBe(
      "/account/success?reference=bps_paid&bookingId=123e4567-e89b-42d3-a456-426614174000",
    );
  });
});
