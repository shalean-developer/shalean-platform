import { describe, expect, it } from "vitest";
import { isExplicitFunnelRevenueFixture } from "../funnelRevenueFixture";

describe("Funnel revenue production candidate fixture exclusions", () => {
  it("excludes bookings explicitly flagged as tests", () => {
    expect(isExplicitFunnelRevenueFixture({ is_test: true, booking_source: "website" })).toBe(true);
  });

  it("excludes the specific documented synthetic R550 sales conversion fixture", () => {
    expect(isExplicitFunnelRevenueFixture({
      is_test: false, booking_source: "sales_document", customer_name: " STAGING R550 CONVERSION TEST ",
    })).toBe(true);
  });

  it("retains genuine sales document bookings without requiring a provider link", () => {
    expect(isExplicitFunnelRevenueFixture({
      is_test: false, booking_source: "sales_document", customer_name: "Legitimate customer",
    })).toBe(false);
  });

  it("does not exclude ordinary website bookings or absent fixture fields", () => {
    expect(isExplicitFunnelRevenueFixture({ booking_source: "website", is_test: false })).toBe(false);
    expect(isExplicitFunnelRevenueFixture({})).toBe(false);
  });

  it("does not exclude an unrelated booking with the fixture name and different source", () => {
    expect(isExplicitFunnelRevenueFixture({
      booking_source: "website", customer_name: "STAGING R550 CONVERSION TEST",
    })).toBe(false);
  });
});
