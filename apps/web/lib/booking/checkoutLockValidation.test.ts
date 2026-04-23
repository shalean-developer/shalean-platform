import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { quoteLockFromRequestBody } from "@/lib/booking/bookingLockQuote";
import {
  BOOKING_CHECKOUT_LOCK_VERSION,
  validateLockForCheckout,
} from "@/lib/booking/checkoutLockValidation";
import type { LockedBooking } from "@/lib/booking/lockedBooking";
import { computeLockQuoteSignature, LOCK_HOLD_MS } from "@/lib/booking/lockQuoteSignature";

function baseLocked(over: Partial<LockedBooking>): LockedBooking {
  return {
    selectedCategory: "regular",
    service: "standard",
    service_group: "regular",
    service_type: "standard_cleaning",
    location: "Claremont",
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

describe("validateLockForCheckout", () => {
  const prevSecret = process.env.BOOKING_LOCK_HMAC_SECRET;

  beforeEach(() => {
    process.env.BOOKING_LOCK_HMAC_SECRET = "vitest-booking-lock-hmac";
  });

  afterEach(() => {
    if (prevSecret === undefined) delete process.env.BOOKING_LOCK_HMAC_SECRET;
    else process.env.BOOKING_LOCK_HMAC_SECRET = prevSecret;
  });

  it("passes: recompute + signature + parity", () => {
    const quoted = quoteLockFromRequestBody({
      service: "standard",
      service_type: "standard_cleaning",
      rooms: 2,
      bathrooms: 1,
      extraRooms: 0,
      extras: [] as string[],
      time: "10:00",
      vipTier: "regular",
    });
    expect(quoted.ok).toBe(true);
    if (!quoted.ok) return;
    const sig = computeLockQuoteSignature({
      job: quoted.job,
      timeHm: quoted.timeHm,
      vipTier: quoted.vipTier,
      dynamicAdjustment: quoted.quoteOptions.dynamicAdjustment,
      cleanersCount: quoted.quoteOptions.cleanersCount,
      quote: quoted.quote,
    });
    const locked = baseLocked({
      finalPrice: quoted.quote.totalZar,
      finalHours: quoted.quote.hours,
      surge: quoted.quote.effectiveSurgeMultiplier,
      quoteSignature: sig,
      lockExpiresAt: new Date(Date.now() + LOCK_HOLD_MS).toISOString(),
    });
    const r = validateLockForCheckout(locked);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.visitTotalZar).toBe(quoted.quote.totalZar);
  });

  it("fails: obsolete tariff version (one behind current)", () => {
    const quoted = quoteLockFromRequestBody({
      service: "standard",
      service_type: "standard_cleaning",
      rooms: 2,
      bathrooms: 1,
      extraRooms: 0,
      extras: [] as string[],
      time: "10:00",
      vipTier: "regular",
    });
    expect(quoted.ok).toBe(true);
    if (!quoted.ok) return;
    const sig = computeLockQuoteSignature({
      job: quoted.job,
      timeHm: quoted.timeHm,
      vipTier: quoted.vipTier,
      dynamicAdjustment: quoted.quoteOptions.dynamicAdjustment,
      cleanersCount: quoted.quoteOptions.cleanersCount,
      quote: quoted.quote,
    });
    const locked = baseLocked({
      pricingVersion: BOOKING_CHECKOUT_LOCK_VERSION - 1,
      finalPrice: quoted.quote.totalZar,
      finalHours: quoted.quote.hours,
      quoteSignature: sig,
      lockExpiresAt: new Date(Date.now() + LOCK_HOLD_MS).toISOString(),
    });
    const r = validateLockForCheckout(locked);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("REQUOTE_REQUIRED");
  });

  it("fails: stale lock version", () => {
    const quoted = quoteLockFromRequestBody({
      service: "standard",
      service_type: "standard_cleaning",
      rooms: 2,
      bathrooms: 1,
      extraRooms: 0,
      extras: [] as string[],
      time: "10:00",
      vipTier: "regular",
    });
    expect(quoted.ok).toBe(true);
    if (!quoted.ok) return;
    const sig = computeLockQuoteSignature({
      job: quoted.job,
      timeHm: quoted.timeHm,
      vipTier: quoted.vipTier,
      dynamicAdjustment: quoted.quoteOptions.dynamicAdjustment,
      cleanersCount: quoted.quoteOptions.cleanersCount,
      quote: quoted.quote,
    });
    const locked = baseLocked({
      pricingVersion: 1,
      finalPrice: quoted.quote.totalZar,
      finalHours: quoted.quote.hours,
      quoteSignature: sig,
      lockExpiresAt: new Date(Date.now() + LOCK_HOLD_MS).toISOString(),
    });
    const r = validateLockForCheckout(locked);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("REQUOTE_REQUIRED");
  });

  it("passes: persisted lock matches lock API when both service + service_type are set (type wins)", () => {
    const body = {
      service: "standard",
      service_type: "standard_cleaning",
      rooms: 2,
      bathrooms: 1,
      extraRooms: 0,
      extras: [] as string[],
      time: "10:00",
      vipTier: "regular" as const,
      cleanersCount: 2,
    };
    const quoted = quoteLockFromRequestBody(body);
    expect(quoted.ok).toBe(true);
    if (!quoted.ok) return;
    const sig = computeLockQuoteSignature({
      job: quoted.job,
      timeHm: quoted.timeHm,
      vipTier: quoted.vipTier,
      dynamicAdjustment: quoted.quoteOptions.dynamicAdjustment,
      cleanersCount: quoted.quoteOptions.cleanersCount,
      quote: quoted.quote,
    });
    const locked = baseLocked({
      service: "standard",
      service_type: "standard_cleaning",
      cleanersCount: 2,
      finalPrice: quoted.quote.totalZar,
      finalHours: quoted.quote.hours,
      surge: quoted.quote.effectiveSurgeMultiplier,
      quoteSignature: sig,
      lockExpiresAt: new Date(Date.now() + LOCK_HOLD_MS).toISOString(),
    });
    const r = validateLockForCheckout(locked);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.visitTotalZar).toBe(quoted.quote.totalZar);
  });

  it("fails: price drift vs recompute", () => {
    const quoted = quoteLockFromRequestBody({
      service: "standard",
      service_type: "standard_cleaning",
      rooms: 2,
      bathrooms: 1,
      extraRooms: 0,
      extras: [] as string[],
      time: "10:00",
      vipTier: "regular",
    });
    expect(quoted.ok).toBe(true);
    if (!quoted.ok) return;
    const sig = computeLockQuoteSignature({
      job: quoted.job,
      timeHm: quoted.timeHm,
      vipTier: quoted.vipTier,
      dynamicAdjustment: quoted.quoteOptions.dynamicAdjustment,
      cleanersCount: quoted.quoteOptions.cleanersCount,
      quote: quoted.quote,
    });
    const locked = baseLocked({
      finalPrice: Math.max(50, quoted.quote.totalZar - 50),
      finalHours: quoted.quote.hours,
      quoteSignature: sig,
      lockExpiresAt: new Date(Date.now() + LOCK_HOLD_MS).toISOString(),
    });
    const r = validateLockForCheckout(locked);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("PRICE_MISMATCH");
  });
});
