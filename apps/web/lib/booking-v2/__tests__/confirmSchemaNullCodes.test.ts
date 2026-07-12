import { describe, expect, it } from "vitest";
import { bookingV2ConfirmSchema } from "@/src/features/booking-v2/schemas";

const base = {
  serviceSlug: "moving-cleaning" as const,
  serviceDetails: { bedrooms: "3", bathrooms: "1" },
  address: "3 Military Road",
  suburb: "Tamboerskloof",
  contactPhone: "0821234567",
  selectedExtras: [],
  equipmentRequired: "no" as const,
  equipmentQuote: null,
  bookingType: "once_off" as const,
  date: "2026-08-15",
  time: "09:00",
  cleanerMode: "individual_cleaners" as const,
  pricingSummary: { total: 1602, estimated_total: 1602 },
};

describe("bookingV2ConfirmSchema null optional codes", () => {
  it("accepts referralCode and promoCode as JSON null (no stored code)", () => {
    const parsed = bookingV2ConfirmSchema.safeParse({
      ...base,
      referralCode: null,
      promoCode: null,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.referralCode).toBeUndefined();
      expect(parsed.data.promoCode).toBeUndefined();
    }
  });

  it("accepts applyCleaningCreditZar as JSON null", () => {
    const parsed = bookingV2ConfirmSchema.safeParse({
      ...base,
      applyCleaningCreditZar: null,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.applyCleaningCreditZar).toBeUndefined();
    }
  });

  it("keeps a non-empty referral code", () => {
    const parsed = bookingV2ConfirmSchema.safeParse({
      ...base,
      referralCode: "FRIEND10",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.referralCode).toBe("FRIEND10");
    }
  });
});
