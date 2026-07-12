import { describe, expect, it } from "vitest";
import {
  applyVipToCleaningSubtotalZar,
  computeServiceFeeZar,
  VIP_APPLIES_ON_BOOKING_V2,
} from "@shalean/pricing";

describe("Phase 2 shared pricing package", () => {
  it("enables VIP on booking-v2", () => {
    expect(VIP_APPLIES_ON_BOOKING_V2).toBe(true);
  });

  it("applies silver VIP on cleaning subtotal", () => {
    const r = applyVipToCleaningSubtotalZar(1000, "silver");
    expect(r.vipDiscountZar).toBe(50);
    expect(r.cleaningSubtotalAfterVipZar).toBe(950);
  });

  it("shares service fee percent math", () => {
    const fee = computeServiceFeeZar(1000, {
      serviceFeeRule: "percent",
      serviceFeeFlatCents: 0,
      serviceFeePercent: 5,
      recurringDiscounts: {},
    });
    expect(fee).toBe(50);
  });
});
