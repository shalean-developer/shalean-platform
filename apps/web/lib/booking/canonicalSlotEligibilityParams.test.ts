import { describe, expect, it } from "vitest";
import type { LockedBooking } from "@/lib/booking/lockedBooking";
import {
  resolveBookingServiceSlugForSlotEligibility,
  resolveBookingServiceSlugFromStoredService,
  slotEligibilityCoreFromBookingCleanersUrl,
  slotEligibilityCoreFromLockBody,
  slotEligibilityCoreFromLockedBooking,
  slotEligibilityCoresEqual,
} from "@/lib/booking/canonicalSlotEligibilityParams";
import { resolveServiceForPricing } from "@/lib/pricing/pricingEngine";

const LOC = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("canonical slot eligibility parity", () => {
  it("lock body matches booking cleaners URL for the same slot inputs", () => {
    const body: Record<string, unknown> = {
      locationId: LOC,
      date: "2026-05-10",
    };
    const catalogServiceId = resolveServiceForPricing({
      service: "standard",
      serviceType: null,
      rooms: 2,
      bathrooms: 2,
      extraRooms: 0,
      extras: [],
    });
    const fromLock = slotEligibilityCoreFromLockBody(body, {
      timeHm: "10:00",
      durationHours: 2,
      catalogServiceId,
    });
    const url = new URL("http://localhost/api/booking/cleaners");
    url.searchParams.set("date", "2026-05-10");
    url.searchParams.set("time", "10:00");
    url.searchParams.set("duration", "120");
    url.searchParams.set("locationId", LOC);
    url.searchParams.set("serviceType", "standard");
    const fromApi = slotEligibilityCoreFromBookingCleanersUrl(url);
    expect(slotEligibilityCoresEqual(fromLock, fromApi)).toBe(true);
  });

  it("legacy service type key normalizes the same for picker URL and checkout locked snapshot", () => {
    const url = new URL("http://localhost/api/booking/cleaners");
    url.searchParams.set("date", "2026-06-01");
    url.searchParams.set("time", "14:30");
    url.searchParams.set("duration", "90");
    url.searchParams.set("locationId", LOC);
    url.searchParams.set("service", "deep_cleaning");
    const fromApi = slotEligibilityCoreFromBookingCleanersUrl(url);

    const locked = {
      date: "2026-06-01",
      time: "14:30",
      finalHours: 1.5,
      duration: 1.5,
      service: "deep_cleaning",
      serviceAreaLocationId: LOC,
      locked: true as const,
      lockedAt: new Date().toISOString(),
      finalPrice: 1,
      surge: 1,
    } as unknown as LockedBooking;

    const fromLocked = slotEligibilityCoreFromLockedBooking(locked);
    expect(slotEligibilityCoresEqual(fromApi, fromLocked)).toBe(true);
    expect(fromLocked?.bookingServiceSlug).toBe("deep");
  });

  it("does not equate different locations", () => {
    const locB = "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee";
    const a = slotEligibilityCoreFromLockBody(
      { locationId: LOC, date: "2026-05-10" },
      { timeHm: "09:00", durationHours: 1, catalogServiceId: "standard" },
    );
    const b = slotEligibilityCoreFromLockBody(
      { locationId: locB, date: "2026-05-10" },
      { timeHm: "09:00", durationHours: 1, catalogServiceId: "standard" },
    );
    expect(slotEligibilityCoresEqual(a, b)).toBe(false);
  });

  it("resolveBookingServiceSlugFromStoredService prefers catalog ids then pricing parser", () => {
    expect(resolveBookingServiceSlugFromStoredService("deep_cleaning")).toBe("deep");
    expect(resolveBookingServiceSlugForSlotEligibility("deep_cleaning")).toBe("deep");
  });
});
