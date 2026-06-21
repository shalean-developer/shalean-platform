import { describe, expect, it } from "vitest";
import {
  BOOKING_LOCATIONS,
  getBookingLocationOptions,
  getLocationFallbackCoords,
  isSupportedBookingLocation,
} from "@/lib/locations/bookingLocations";

describe("bookingLocations", () => {
  it("exports sorted options with Other last", () => {
    const options = getBookingLocationOptions();
    const withoutOther = options.slice(0, -1);
    const sorted = [...withoutOther].sort((a, b) => a.localeCompare(b, "en-ZA"));
    expect(withoutOther).toEqual(sorted);
    expect(options[options.length - 1]).toBe("Other");
  });

  it("includes required Shalean service areas", () => {
    const names = new Set(BOOKING_LOCATIONS.map((l) => l.name));
    expect(names.has("Claremont")).toBe(true);
    expect(names.has("Stellenbosch")).toBe(true);
    expect(names.has("George")).toBe(true);
    expect(names.has("Other")).toBe(true);
  });

  it("provides fallback coords for metro suburbs", () => {
    expect(getLocationFallbackCoords("Sea Point")).not.toBeNull();
    expect(getLocationFallbackCoords("Other")).toBeNull();
  });

  it("validates supported locations case-insensitively", () => {
    expect(isSupportedBookingLocation("sea point")).toBe(true);
    expect(isSupportedBookingLocation("unknown suburb")).toBe(false);
  });
});
