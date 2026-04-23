import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { quoteLockFromRequestBodyWithSnapshot } from "@/lib/booking/bookingLockQuote";
import {
  BOOKING_CHECKOUT_LOCK_VERSION,
  validateLockForCheckout,
} from "@/lib/booking/checkoutLockValidation";
import type { LockedBooking } from "@/lib/booking/lockedBooking";
import { computeLockQuoteSignature, LOCK_HOLD_MS } from "@/lib/booking/lockQuoteSignature";
import { vitestTestPricingRatesSnapshot } from "@/lib/pricing/testPricingSnapshot";

const snap = vitestTestPricingRatesSnapshot();

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
    const r = validateLockForCheckout(locked, Date.now(), { ratesSnapshot: snap });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.visitTotalZar).toBe(quoted.quote.totalZar);
      const sum =
        r.jobSubtotalSplit.serviceBaseZar + r.jobSubtotalSplit.roomsZar + r.jobSubtotalSplit.extrasZar;
      expect(sum).toBe(quoted.quote.subtotalZar);
    }
  });

  it("fails: obsolete tariff version (one behind current)", () => {
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
    const r = validateLockForCheckout(locked, Date.now(), { ratesSnapshot: snap });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("REQUOTE_REQUIRED");
  });

  it("fails: stale lock version", () => {
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
    const r = validateLockForCheckout(locked, Date.now(), { ratesSnapshot: snap });
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
    const quoted = quoteLockFromRequestBodyWithSnapshot(body, snap);
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
    const r = validateLockForCheckout(locked, Date.now(), { ratesSnapshot: snap });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.visitTotalZar).toBe(quoted.quote.totalZar);
  });

  it("fails: price drift vs recompute", () => {
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
    const r = validateLockForCheckout(locked, Date.now(), { ratesSnapshot: snap });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("PRICE_MISMATCH");
  });

  it("fails: PRICING_SNAPSHOT_MISSING when pricing_version_id set but no snapshot passed", () => {
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
    expect(quoted.ok).toBe(true);
    if (!quoted.ok) return;
    const locked = baseLocked({
      finalPrice: quoted.quote.totalZar,
      finalHours: quoted.quote.hours,
      surge: quoted.quote.effectiveSurgeMultiplier,
      pricing_version_id: "00000000-0000-4000-8000-000000000001",
    });
    const r = validateLockForCheckout(locked);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("PRICING_SNAPSHOT_MISSING");
  });

  it("passes: frozen ratesSnapshot path with pricing_version_id", () => {
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
      pricing_version_id: "00000000-0000-4000-8000-000000000001",
    });
    const r = validateLockForCheckout(locked, Date.now(), { ratesSnapshot: snap });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.visitTotalZar).toBe(quoted.quote.totalZar);
  });
});
