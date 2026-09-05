import { describe, expect, it } from "vitest";
import { assertAuthoritativePricingCatalogReads } from "@/lib/booking-v2/loadBookingV2Catalog";

describe("SR-04C authoritative pricing catalog reads", () => {
  it("accepts successful pricing reads", () => {
    expect(() =>
      assertAuthoritativePricingCatalogReads({
        servicesError: null,
        extrasError: null,
        configError: null,
      }),
    ).not.toThrow();
  });

  it("fails closed when pricing_services cannot be read", () => {
    expect(() =>
      assertAuthoritativePricingCatalogReads({
        servicesError: { message: "services unavailable" },
        extrasError: null,
        configError: null,
      }),
    ).toThrow(/pricing_services: services unavailable/);
  });

  it("fails closed when pricing_extras cannot be read", () => {
    expect(() =>
      assertAuthoritativePricingCatalogReads({
        servicesError: null,
        extrasError: { message: "extras unavailable" },
        configError: null,
      }),
    ).toThrow(/pricing_extras: extras unavailable/);
  });

  it("fails closed when pricing_booking_config cannot be read", () => {
    expect(() =>
      assertAuthoritativePricingCatalogReads({
        servicesError: null,
        extrasError: null,
        configError: { message: "config unavailable" },
      }),
    ).toThrow(/pricing_booking_config: config unavailable/);
  });

  it("reports every failed authoritative source together", () => {
    expect(() =>
      assertAuthoritativePricingCatalogReads({
        servicesError: { message: "services down" },
        extrasError: { message: "extras down" },
        configError: { message: "config down" },
      }),
    ).toThrow(/pricing_services: services down; pricing_extras: extras down; pricing_booking_config: config down/);
  });
});
