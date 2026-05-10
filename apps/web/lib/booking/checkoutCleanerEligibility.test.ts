import { describe, it, expect, vi, afterEach } from "vitest";
import {
  checkoutDispatchOfferTtlSeconds,
  checkoutDurationMinutesFromLocked,
  DISPATCH_CHECKOUT_OFFER_TTL_DEFAULT_SECONDS,
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
  it("defaults to 1 hour", () => {
    expect(DISPATCH_CHECKOUT_OFFER_TTL_DEFAULT_SECONDS).toBe(3600);
    expect(checkoutDispatchOfferTtlSeconds()).toBe(3600);
  });

  it("respects env in range", () => {
    vi.stubEnv("DISPATCH_CHECKOUT_OFFER_TTL_SECONDS", "240");
    expect(checkoutDispatchOfferTtlSeconds()).toBe(240);
  });

  it("trims env whitespace", () => {
    vi.stubEnv("DISPATCH_CHECKOUT_OFFER_TTL_SECONDS", "  900  ");
    expect(checkoutDispatchOfferTtlSeconds()).toBe(900);
  });

  it("clamps below minimum to 60s", () => {
    vi.stubEnv("DISPATCH_CHECKOUT_OFFER_TTL_SECONDS", "30");
    expect(checkoutDispatchOfferTtlSeconds()).toBe(60);
  });

  it("clamps above maximum to 86400s", () => {
    vi.stubEnv("DISPATCH_CHECKOUT_OFFER_TTL_SECONDS", "999999");
    expect(checkoutDispatchOfferTtlSeconds()).toBe(86400);
  });

  it("uses default for non-numeric env", () => {
    vi.stubEnv("DISPATCH_CHECKOUT_OFFER_TTL_SECONDS", "nope");
    expect(checkoutDispatchOfferTtlSeconds()).toBe(3600);
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
