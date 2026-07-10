import { describe, expect, it } from "vitest";
import { generateTemplateCampaignContent } from "../generateCampaignContent";
import type { PromotionRow } from "../types";

function promo(overrides: Partial<PromotionRow> = {}): PromotionRow {
  return {
    id: "p1",
    slug: "first-booking-15",
    name: "First Booking Discount",
    description: "15% off your first cleaning.",
    promotion_type: "first_booking",
    status: "active",
    starts_at: null,
    ends_at: "2030-01-01T00:00:00.000Z",
    banner_image_url: null,
    landing_page_path: null,
    promo_code: "FIRST-BOOKING-15",
    auto_apply: true,
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
    show_on_homepage: true,
    show_on_booking: true,
    show_on_pricing: true,
    show_announcement_bar: true,
    display_config: { headline: "15% off your first clean", cta: "Book now" },
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

describe("generateTemplateCampaignContent", () => {
  it("produces all required marketing channels", () => {
    const items = generateTemplateCampaignContent({
      promotion: promo(),
      bookingUrl: "https://shalean.co.za/campaigns/first-booking-15",
    });
    const channels = items.map((i) => i.channel);
    expect(channels).toContain("facebook");
    expect(channels).toContain("instagram");
    expect(channels).toContain("whatsapp");
    expect(channels).toContain("email");
    expect(channels).toContain("sms");
    expect(channels).toContain("blog");
    expect(channels).toContain("landing");
    expect(channels).toContain("meta_seo");
    const sms = items.find((i) => i.channel === "sms");
    expect(sms?.body.length).toBeLessThanOrEqual(160);
    const twitter = items.find((i) => i.channel === "twitter");
    expect(twitter?.body.length).toBeLessThanOrEqual(260);
    expect(items.find((i) => i.channel === "email")?.htmlBody).toContain("FIRST-BOOKING-15");
  });
});
