import { describe, expect, it } from "vitest";
import {
  BOOKING_V2_TO_CANONICAL_SERVICE,
  bookingServiceSlugFromBookingRow,
  canonicalServiceSlugFromBookingV2,
  deriveDurationMinutesFromBookingV2,
  parseServiceDetailInt,
} from "@/lib/booking-v2/bookingV2ServiceSlug";

describe("bookingV2ServiceSlug", () => {
  it("maps v2 slugs to canonical eligibility ids", () => {
    expect(BOOKING_V2_TO_CANONICAL_SERVICE["regular-cleaning"]).toBe("standard");
    expect(canonicalServiceSlugFromBookingV2("regular-cleaning")).toBe("standard");
    expect(canonicalServiceSlugFromBookingV2("deep-cleaning")).toBe("deep");
    expect(canonicalServiceSlugFromBookingV2("airbnb-cleaning")).toBe("airbnb");
  });

  it("maps canonical persisted slugs back to v2 path slugs", () => {
    expect(bookingServiceSlugFromBookingRow({ service: "Standard Cleaning", service_slug: "standard" })).toBe(
      "regular-cleaning",
    );
    expect(bookingServiceSlugFromBookingRow({ service: null, service_slug: "deep-cleaning" })).toBe("deep-cleaning");
  });

  it("derives duration from pricing or static config", () => {
    expect(deriveDurationMinutesFromBookingV2("regular-cleaning", 150)).toBe(150);
    expect(deriveDurationMinutesFromBookingV2("regular-cleaning", null)).toBeGreaterThanOrEqual(30);
  });

  it("parses service detail integers with fallbacks", () => {
    expect(parseServiceDetailInt({ bedrooms: "3" }, "bedrooms", 2)).toBe(3);
    expect(parseServiceDetailInt({}, "bedrooms", 2)).toBe(2);
  });
});
