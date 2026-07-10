import { describe, expect, it } from "vitest";
import {
  computeDiscountZar,
  evaluatePromotions,
  resolveStacking,
  bundleMatches,
} from "../evaluate";
import type { PromotionBundleRow, PromotionRow } from "../types";

function basePromo(overrides: Partial<PromotionRow> = {}): PromotionRow {
  return {
    id: "p1",
    slug: "test",
    name: "Test Promo",
    description: null,
    promotion_type: "promo_code",
    status: "active",
    starts_at: null,
    ends_at: null,
    banner_image_url: null,
    landing_page_path: null,
    promo_code: "SAVE15",
    auto_apply: false,
    discount_type: "percent",
    discount_value: 15,
    max_discount_zar: null,
    min_booking_amount_zar: 0,
    customer_eligibility: {},
    booking_eligibility: {},
    usage_limit_total: null,
    usage_limit_per_customer: 1,
    budget_zar: null,
    budget_spent_zar: 0,
    stackable: false,
    stack_priority: 10,
    show_on_homepage: false,
    show_on_booking: true,
    show_on_pricing: false,
    show_announcement_bar: false,
    display_config: {},
    views_count: 0,
    clicks_count: 0,
    bookings_started_count: 0,
    bookings_completed_count: 0,
    revenue_generated_zar: 0,
    redemptions_count: 0,
    created_by: null,
    updated_by: null,
    duplicated_from_id: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("computeDiscountZar", () => {
  it("applies percent with max cap", () => {
    expect(
      computeDiscountZar({
        discountType: "percent",
        discountValue: 15,
        subtotalZar: 1000,
        maxDiscountZar: 100,
      }),
    ).toBe(100);
  });

  it("applies fixed capped at subtotal", () => {
    expect(
      computeDiscountZar({
        discountType: "fixed",
        discountValue: 200,
        subtotalZar: 150,
      }),
    ).toBe(150);
  });
});

describe("evaluatePromotions", () => {
  it("auto-applies first booking discount for new customers", () => {
    const promo = basePromo({
      id: "fb",
      slug: "first-booking-15",
      promotion_type: "first_booking",
      promo_code: null,
      auto_apply: true,
      customer_eligibility: { requires_no_completed_bookings: true },
    });
    const result = evaluatePromotions({
      promotions: [promo],
      ctx: {
        userId: "u1",
        customerEmail: "a@b.com",
        completedBookingCount: 0,
        serviceSlug: "standard-cleaning",
        selectedExtraIds: [],
        subtotalZar: 800,
      },
    });
    expect(result.applied).toHaveLength(1);
    expect(result.totalDiscountZar).toBe(120);
  });

  it("rejects first booking when customer has history", () => {
    const promo = basePromo({
      promotion_type: "first_booking",
      promo_code: null,
      auto_apply: true,
      customer_eligibility: { requires_no_completed_bookings: true },
    });
    const result = evaluatePromotions({
      promotions: [promo],
      ctx: {
        userId: "u1",
        customerEmail: "a@b.com",
        completedBookingCount: 2,
        serviceSlug: "standard-cleaning",
        selectedExtraIds: [],
        subtotalZar: 800,
      },
    });
    expect(result.applied).toHaveLength(0);
    expect(result.rejected[0]?.reason).toMatch(/no completed bookings/i);
  });

  it("applies promo code when provided", () => {
    const promo = basePromo();
    const result = evaluatePromotions({
      promotions: [promo],
      ctx: {
        userId: "u1",
        customerEmail: "a@b.com",
        completedBookingCount: 1,
        serviceSlug: "standard-cleaning",
        selectedExtraIds: [],
        subtotalZar: 1000,
        promoCode: "save15",
      },
    });
    expect(result.applied[0]?.discountZar).toBe(150);
    expect(result.applied[0]?.source).toBe("code");
  });
});

describe("resolveStacking", () => {
  it("keeps best non-stackable plus stackable", () => {
    const applied = resolveStacking([
      {
        promotionId: "a",
        slug: "a",
        name: "A",
        discountZar: 100,
        discountType: "fixed",
        description: "",
        stackable: false,
        stackPriority: 10,
        source: "auto",
      },
      {
        promotionId: "b",
        slug: "b",
        name: "B",
        discountZar: 50,
        discountType: "fixed",
        description: "",
        stackable: false,
        stackPriority: 20,
        source: "auto",
      },
      {
        promotionId: "m",
        slug: "membership",
        name: "Member",
        discountZar: 40,
        discountType: "percent",
        description: "",
        stackable: true,
        stackPriority: 60,
        source: "membership",
      },
    ]);
    expect(applied.map((a) => a.promotionId)).toEqual(["a", "m"]);
  });
});

describe("bundleMatches", () => {
  const bundle: PromotionBundleRow = {
    id: "b1",
    promotion_id: "p",
    name: "Deep + Oven",
    required_service_slugs: ["deep-cleaning"],
    required_extra_ids: ["oven-cleaning"],
    min_services: 2,
    discount_type: "percent",
    discount_value: 10,
    max_discount_zar: null,
    stackable: false,
    enabled: true,
    sort_order: 1,
  };

  it("matches when service and extra present", () => {
    expect(bundleMatches(bundle, "deep-cleaning", ["oven-cleaning"])).toBe(true);
  });

  it("fails without extra", () => {
    expect(bundleMatches(bundle, "deep-cleaning", [])).toBe(false);
  });
});
