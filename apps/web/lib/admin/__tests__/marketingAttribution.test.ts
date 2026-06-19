import { describe, expect, it } from "vitest";
import { aggregateMarketingData } from "@/lib/admin/marketingAggregation";
import { inferMarketingChannel, mergeSessionChannel } from "@/lib/admin/marketingAttribution";

describe("inferMarketingChannel", () => {
  it("maps paid click ids to ad channels", () => {
    expect(inferMarketingChannel({ gclid: "abc" })).toBe("google_ads");
    expect(inferMarketingChannel({ fbclid: "xyz" })).toBe("facebook_ads");
  });

  it("uses acquisition first-touch landing paths for organic SEO", () => {
    expect(
      inferMarketingChannel({
        pathname: "/booking/success",
        acquisition_first_touch: { landing_pathname: "/services/deep-cleaning-cape-town" },
      }),
    ).toBe("organic_seo");
  });

  it("recognizes service, blog, and location SEO paths", () => {
    expect(inferMarketingChannel({ pathname: "/services/standard-cleaning-cape-town" })).toBe("organic_seo");
    expect(inferMarketingChannel({ pathname: "/blog/airbnb-cleaning-checklist-cape-town" })).toBe("organic_seo");
    expect(inferMarketingChannel({ pathname: "/locations/claremont-cleaning-services" })).toBe("organic_seo");
    expect(inferMarketingChannel({ pathname: "/cleaning-prices-cape-town" })).toBe("organic_seo");
  });

  it("falls back to direct for generic booking routes", () => {
    expect(inferMarketingChannel({ pathname: "/book/regular-cleaning" })).toBe("direct");
  });
});

describe("mergeSessionChannel", () => {
  it("prefers ad and organic signals over direct", () => {
    expect(mergeSessionChannel("direct", "organic_seo")).toBe("organic_seo");
    expect(mergeSessionChannel("organic_seo", "google_ads")).toBe("google_ads");
    expect(mergeSessionChannel("google_ads", "direct")).toBe("google_ads");
  });
});

describe("aggregateMarketingData", () => {
  it("aggregates funnel counts, channel bookings, and spend", () => {
    const summary = aggregateMarketingData({
      events: [
        {
          event_type: "page_view",
          booking_id: null,
          created_at: "2026-06-10T10:00:00.000Z",
          payload: {
            session_id: "sess-1",
            pathname: "/services/deep-cleaning-cape-town",
          },
        },
        {
          event_type: "start_booking",
          booking_id: null,
          created_at: "2026-06-10T10:01:00.000Z",
          payload: { session_id: "sess-1", pathname: "/book/deep-cleaning" },
        },
        {
          event_type: "view_price",
          booking_id: null,
          created_at: "2026-06-10T10:02:00.000Z",
          payload: { session_id: "sess-1", pathname: "/book/deep-cleaning" },
        },
        {
          event_type: "select_time",
          booking_id: null,
          created_at: "2026-06-10T10:03:00.000Z",
          payload: { session_id: "sess-1", pathname: "/book/deep-cleaning" },
        },
        {
          event_type: "complete_booking",
          booking_id: "booking-1",
          created_at: "2026-06-10T10:04:00.000Z",
          payload: { session_id: "sess-1", pathname: "/booking/success" },
        },
      ],
      spendRows: [{ channel: "google_ads", amount: 1000, date: "2026-06-10" }],
      bookingRevenue: new Map([["booking-1", 850]]),
      days: 7,
      since: new Date("2026-06-04T00:00:00.000Z"),
    });

    expect(summary.funnel).toEqual({
      visitors: 1,
      started: 1,
      viewedPrice: 1,
      selectedTime: 1,
      completed: 1,
    });
    expect(summary.channels.find((c) => c.channel === "organic_seo")).toMatchObject({
      bookings: 1,
      revenue: 850,
    });
    expect(summary.kpis.totalAdSpend).toBe(1000);
    expect(summary.insights.some((i) => i.includes("Organic SEO"))).toBe(true);
  });
});
