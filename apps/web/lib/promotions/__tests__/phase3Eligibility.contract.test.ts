import { describe, expect, it } from "vitest";
import { checkBookingEligibility, checkCustomerEligibility } from "@/lib/promotions/evaluate";

describe("Phase 3 promo eligibility enforcement", () => {
  it("enforces membership_plan_slugs", () => {
    const reason = checkCustomerEligibility(
      { membership_plan_slugs: ["gold-monthly"] },
      {
        userId: "u1",
        customerEmail: "a@b.com",
        completedBookingCount: 0,
        serviceSlug: "regular-cleaning",
        selectedExtraIds: [],
        subtotalZar: 500,
        membershipDiscountPercent: 10,
        membershipPlanSlug: "silver-monthly",
      },
    );
    expect(reason).toMatch(/qualifying membership/i);
  });

  it("enforces one_per_year", () => {
    const reason = checkCustomerEligibility(
      { one_per_year: true },
      {
        userId: "u1",
        customerEmail: "a@b.com",
        completedBookingCount: 1,
        serviceSlug: "regular-cleaning",
        selectedExtraIds: [],
        subtotalZar: 500,
        promoRedeemedThisYear: true,
      },
    );
    expect(reason).toMatch(/once per year/i);
  });

  it("enforces suburb_ids", () => {
    const reason = checkBookingEligibility(
      { suburb_ids: ["sea-point"] },
      {
        userId: null,
        customerEmail: "",
        completedBookingCount: 0,
        serviceSlug: "regular-cleaning",
        selectedExtraIds: [],
        subtotalZar: 500,
        suburb: "Camps Bay",
      },
      0,
    );
    expect(reason).toMatch(/suburb/i);
  });

  it("enforces customer_segments", () => {
    const reason = checkCustomerEligibility(
      { customer_segments: ["corporate"] },
      {
        userId: "u1",
        customerEmail: "a@b.com",
        completedBookingCount: 2,
        serviceSlug: "regular-cleaning",
        selectedExtraIds: [],
        subtotalZar: 500,
        customerSegments: ["residential"],
      },
    );
    expect(reason).toMatch(/segment/i);
  });
});
