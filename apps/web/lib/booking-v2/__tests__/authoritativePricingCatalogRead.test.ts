import { describe, expect, it } from "vitest";
import {
  assertAuthoritativePricingCatalogReads,
  assertAuthoritativePricingServiceCoverage,
} from "@/lib/booking-v2/loadBookingV2Catalog";

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


describe("SR-04C authoritative pricing service coverage", () => {
  const row = (base_price: number) => ({
    base_price,
    price_per_bedroom: 0,
    price_per_bathroom: 0,
    price_per_extra_room: 0,
    service_fee_zar: 0,
    duration_base: 3.5,
    duration_per_bedroom: 0.5,
    duration_per_bathroom: 0.5,
    duration_per_extra_room: 0.3,
    min_hours: 3.5,
    max_hours: 8,
  });

  it("accepts all six authoritative service families", () => {
    expect(() =>
      assertAuthoritativePricingServiceCoverage({
        standard: row(250),
        deep: row(1200),
        move: row(1200),
        airbnb: row(250),
        carpet: row(500),
        office: row(300),
      }),
    ).not.toThrow();
  });

  it("fails closed when pricing_services is empty", () => {
    expect(() => assertAuthoritativePricingServiceCoverage({})).toThrow(
      /authoritative booking pricing is incomplete/i,
    );
  });

  it("fails closed when a service row has a zero base price", () => {
    expect(() =>
      assertAuthoritativePricingServiceCoverage({
        standard: row(0),
        deep: row(1200),
        move: row(1200),
        airbnb: row(250),
        carpet: row(500),
        office: row(300),
      }),
    ).toThrow(/regular-cleaning/);
  });
});
