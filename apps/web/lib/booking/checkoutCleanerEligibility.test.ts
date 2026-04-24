import { describe, it, expect, vi, afterEach } from "vitest";
import {
  checkoutDispatchOfferTtlSeconds,
  checkoutDurationMinutesFromLocked,
} from "@/lib/booking/checkoutCleanerEligibility";
import type { LockedBooking } from "@/lib/booking/lockedBooking";

function baseLocked(over: Partial<LockedBooking>): LockedBooking {
  return {
    date: "2026-04-24",
    time: "10:00",
    finalPrice: 100,
    finalHours: 2,
    surge: 1,
    locked: true,
    lockedAt: new Date().toISOString(),
    ...over,
  } as LockedBooking;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("checkoutDispatchOfferTtlSeconds", () => {
  it("defaults to 180", () => {
    expect(checkoutDispatchOfferTtlSeconds()).toBe(180);
  });

  it("respects env in range", () => {
    vi.stubEnv("DISPATCH_CHECKOUT_OFFER_TTL_SECONDS", "240");
    expect(checkoutDispatchOfferTtlSeconds()).toBe(240);
  });
});

describe("checkoutDurationMinutesFromLocked", () => {
  it("defaults to 120 when null", () => {
    expect(checkoutDurationMinutesFromLocked(null)).toBe(120);
  });

  it("uses duration hours when set", () => {
    expect(checkoutDurationMinutesFromLocked(baseLocked({ duration: 3 }))).toBe(180);
  });

  it("uses finalHours when duration missing", () => {
    expect(checkoutDurationMinutesFromLocked(baseLocked({ finalHours: 1.5 }))).toBe(90);
  });
});
