import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { quoteLockFromRequestBodyWithSnapshot } from "@/lib/booking/bookingLockQuote";
import {
  computeLockQuoteSignature,
  isLockExpired,
  LOCK_HOLD_MS,
  verifyLockQuoteSignature,
} from "@/lib/booking/lockQuoteSignature";
import type { LockedBooking } from "@/lib/booking/lockedBooking";
import { BOOKING_CHECKOUT_LOCK_VERSION } from "@/lib/booking/checkoutLockValidation";
import { vitestTestPricingRatesSnapshot } from "@/lib/pricing/testPricingSnapshot";

const snap = vitestTestPricingRatesSnapshot();

/** Same job shape as `POST /api/booking/lock` (service_type wins over service id). */
function lockApiQuote() {
  const quoted = quoteLockFromRequestBodyWithSnapshot(
    {
      service: "standard",
      service_type: "standard_cleaning",
      rooms: 2,
      bathrooms: 1,
      extraRooms: 0,
      extras: [] as string[],
      time: "10:00",
      vipTier: "regular",
    },
    snap,
  );
  if (!quoted.ok) throw new Error(quoted.error);
  return quoted;
}

function minimalLocked(over: Partial<LockedBooking>): LockedBooking {
  return {
    selectedCategory: "regular",
    service: "standard",
    service_group: "regular",
    service_type: "standard_cleaning",
    location: "Claremont, Cape Town",
    propertyType: "apartment",
    subServices: [],
    notes: "",
    cleaningFrequency: "one_time",
    rooms: 2,
    bathrooms: 1,
    extraRooms: 0,
    extras: [],
    date: "2026-04-23",
    time: "10:00",
    finalPrice: 0,
    finalHours: 0,
    surge: 1,
    locked: true,
    lockedAt: new Date().toISOString(),
    pricingVersion: BOOKING_CHECKOUT_LOCK_VERSION,
    ...over,
  } as LockedBooking;
}

describe("lockQuoteSignature", () => {
  const prevSecret = process.env.BOOKING_LOCK_HMAC_SECRET;

  beforeEach(() => {
    process.env.BOOKING_LOCK_HMAC_SECRET = "vitest-booking-lock-hmac";
  });

  afterEach(() => {
    if (prevSecret === undefined) delete process.env.BOOKING_LOCK_HMAC_SECRET;
    else process.env.BOOKING_LOCK_HMAC_SECRET = prevSecret;
  });

  it("normal flow: signature verifies for server-shaped lock", () => {
    const { job, quote: q, timeHm, vipTier, quoteOptions } = lockApiQuote();
    const sig = computeLockQuoteSignature({
      job,
      timeHm,
      vipTier,
      dynamicAdjustment: quoteOptions.dynamicAdjustment,
      cleanersCount: quoteOptions.cleanersCount,
      quote: q,
    });
    const locked = minimalLocked({
      finalPrice: q.totalZar,
      finalHours: q.hours,
      surge: q.effectiveSurgeMultiplier,
      quoteSignature: sig,
      lockExpiresAt: new Date(Date.now() + LOCK_HOLD_MS).toISOString(),
    });
    expect(verifyLockQuoteSignature(locked, snap)).toBe(true);
  });

  it("tamper finalPrice: verify fails", () => {
    const { job, quote: q, timeHm, vipTier, quoteOptions } = lockApiQuote();
    const sig = computeLockQuoteSignature({
      job,
      timeHm,
      vipTier,
      dynamicAdjustment: quoteOptions.dynamicAdjustment,
      cleanersCount: quoteOptions.cleanersCount,
      quote: q,
    });
    const locked = minimalLocked({
      finalPrice: q.totalZar - 200,
      finalHours: q.hours,
      surge: q.effectiveSurgeMultiplier,
      quoteSignature: sig,
      lockExpiresAt: new Date(Date.now() + LOCK_HOLD_MS).toISOString(),
    });
    expect(verifyLockQuoteSignature(locked, snap)).toBe(false);
  });

  it("extras changed after lock: verify fails", () => {
    const { job, quote: q, timeHm, vipTier, quoteOptions } = lockApiQuote();
    const sig = computeLockQuoteSignature({
      job,
      timeHm,
      vipTier,
      dynamicAdjustment: quoteOptions.dynamicAdjustment,
      cleanersCount: quoteOptions.cleanersCount,
      quote: q,
    });
    const locked = minimalLocked({
      finalPrice: q.totalZar,
      finalHours: q.hours,
      surge: q.effectiveSurgeMultiplier,
      quoteSignature: sig,
      lockExpiresAt: new Date(Date.now() + LOCK_HOLD_MS).toISOString(),
      extras: ["inside-oven"],
    });
    expect(verifyLockQuoteSignature(locked, snap)).toBe(false);
  });

  it("expired lock: isLockExpired true", () => {
    const locked = minimalLocked({
      lockExpiresAt: new Date(Date.now() - 60_000).toISOString(),
      lockedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
    });
    expect(isLockExpired(locked)).toBe(true);
  });
});
