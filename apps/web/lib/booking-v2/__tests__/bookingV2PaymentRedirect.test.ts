import { describe, expect, it } from "vitest";
import { bookingV2SuccessHref } from "@/lib/booking-v2/bookingV2PaymentRedirect";

describe("bookingV2PaymentRedirect", () => {
  it("builds account success URL with encoded reference", () => {
    expect(bookingV2SuccessHref("bv2_abc 123")).toBe(
      "/account/success?reference=bv2_abc%20123",
    );
  });
});
