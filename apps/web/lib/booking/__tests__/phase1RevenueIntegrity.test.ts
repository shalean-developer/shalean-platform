import { describe, expect, it } from "vitest";
import { getPromoDiscountZar } from "@/lib/booking/promoCodes";
import {
  CUSTOMER_PRICING_SOT,
  LEGACY_HARDCODED_PROMOS_ENABLED,
} from "@/lib/booking/customerPricingSot";
import {
  PAYMENT_AMOUNT_MISMATCH_EPS_CENTS,
  PAYMENT_AMOUNT_MISMATCH_EPS_ZAR,
} from "@/lib/payments/paymentAmountMismatch";

describe("Phase 1 revenue integrity freeze", () => {
  it("declares booking-v2 as customer pricing SoT", () => {
    expect(CUSTOMER_PRICING_SOT).toBe("booking_v2");
  });

  it("disables legacy hardcoded promo codes", () => {
    expect(LEGACY_HARDCODED_PROMOS_ENABLED).toBe(false);
    expect(getPromoDiscountZar("WELCOME50", 500)).toBeNull();
    expect(getPromoDiscountZar("SAVE10", 500)).toBeNull();
    expect(getPromoDiscountZar("FIRST100", 500)).toBeNull();
  });

  it("unifies payment mismatch epsilon at 1 ZAR", () => {
    expect(PAYMENT_AMOUNT_MISMATCH_EPS_ZAR).toBe(1);
    expect(PAYMENT_AMOUNT_MISMATCH_EPS_CENTS).toBe(100);
  });
});
