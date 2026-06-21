import { describe, expect, it } from "vitest";
import {
  computeEquipmentQuote,
  computeDistanceKmFromCoords,
  defaultEquipmentPricingConfig,
} from "@/lib/booking-v2/equipmentPricing";
import {
  bookingLocationSlug,
  getLocationFallbackCoords,
  getBookingLocationOptions,
  isSupportedBookingLocation,
} from "@/lib/locations/bookingLocations";

describe("computeEquipmentQuote", () => {
  const config = defaultEquipmentPricingConfig();

  it("returns zero fee when equipment not required", () => {
    const q = computeEquipmentQuote({ config, distanceKm: 10, equipmentRequired: false });
    expect(q.logistics_fee).toBe(0);
    expect(q.manual_quote_required).toBe(false);
  });

  it("calculates 10 km as R450 + R250 = R700", () => {
    const q = computeEquipmentQuote({ config, distanceKm: 10, equipmentRequired: true });
    expect(q.distance_km).toBe(10);
    expect(q.base_fee).toBe(450);
    expect(q.distance_charge).toBe(250);
    expect(q.logistics_fee).toBe(700);
    expect(q.manual_quote_required).toBe(false);
  });

  it("requires manual quote over 20 km", () => {
    const q = computeEquipmentQuote({ config, distanceKm: 21, equipmentRequired: true });
    expect(q.manual_quote_required).toBe(true);
    expect(q.logistics_fee).toBe(0);
    expect(q.distance_charge).toBe(0);
  });

  it("auto-quotes at exactly 20 km", () => {
    const q = computeEquipmentQuote({ config, distanceKm: 20, equipmentRequired: true });
    expect(q.manual_quote_required).toBe(false);
    expect(q.logistics_fee).toBe(450 + 20 * 25);
  });
});

describe("computeDistanceKmFromCoords", () => {
  it("returns rounded km between two points", () => {
    const config = defaultEquipmentPricingConfig();
    const km = computeDistanceKmFromCoords(config, -33.9249, 18.4241);
    expect(km).toBeGreaterThan(0);
    expect(km).toBeLessThan(50);
  });
});

describe("getLocationFallbackCoords", () => {
  it("resolves Claremont suburb slug", () => {
    expect(bookingLocationSlug("Claremont")).toBe("claremont");
    const coords = getLocationFallbackCoords("Claremont");
    expect(coords).not.toBeNull();
    expect(coords!.lat).toBeCloseTo(-33.978, 2);
  });

  it("auto-quotes Claremont via suburb centroid distance", () => {
    const config = defaultEquipmentPricingConfig();
    const coords = getLocationFallbackCoords("Claremont")!;
    const km = computeDistanceKmFromCoords(config, coords.lat, coords.lng);
    const q = computeEquipmentQuote({ config, distanceKm: km, equipmentRequired: true });
    expect(q.manual_quote_required).toBe(false);
    expect(q.logistics_fee).toBeGreaterThan(450);
    expect(q.logistics_fee).toBeLessThan(600);
  });

  it("returns null for Other suburb", () => {
    expect(getLocationFallbackCoords("Other")).toBeNull();
  });
});

describe("getBookingLocationOptions", () => {
  it("lists Other last", () => {
    const options = getBookingLocationOptions();
    expect(options[options.length - 1]).toBe("Other");
    expect(options.length).toBeGreaterThan(100);
  });

  it("recognises supported locations", () => {
    expect(isSupportedBookingLocation("Claremont")).toBe(true);
    expect(isSupportedBookingLocation("Other")).toBe(true);
    expect(isSupportedBookingLocation("Not A Place")).toBe(false);
  });
});
