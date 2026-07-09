import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { slotEligibilityCoreFromLockBody } from "@/lib/booking/canonicalSlotEligibilityParams";
import {
  BOOKING_CHECKOUT_LOCK_VERSION,
  validateLockForCheckout,
} from "@/lib/booking/checkoutLockValidation";
import { checkoutDurationMinutesFromLocked } from "@/lib/booking/checkoutCleanerEligibility";
import { quoteLockFromRequestBodyWithSnapshot } from "@/lib/booking/bookingLockQuote";
import { resolveLegacyBookingQuote } from "@/lib/booking/quote/resolveBookingQuote";
import type { LockedBooking } from "@/lib/booking/lockedBooking";
import {
  buildLockQuoteSignString,
  computeLockQuoteSignature,
  LOCK_HOLD_MS,
} from "@/lib/booking/lockQuoteSignature";
import {
  legacyHoursToDurationMinutes,
  selectLegacyJobDurationHours,
  selectLegacyJobDurationMinutes,
} from "@/lib/pricing/legacyDurationSelection";
import {
  estimateUnifiedJobDurationHours,
} from "@/lib/booking/quote/resolveBookingDurationWorkload";
import {
  estimateJobDurationHoursSnapshot,
  quoteCheckoutZarWithSnapshot,
  quoteJobDurationHoursWithSnapshot,
} from "@/lib/pricing/pricingEngineSnapshot";
import { vitestTestPricingRatesSnapshot } from "@/lib/pricing/testPricingSnapshot";

const snap = vitestTestPricingRatesSnapshot();
const libRoot = path.resolve(__dirname, "..");
const webRoot = path.resolve(__dirname, "../..");
const LOC = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

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

describe("unified booking quote duration (Phase 1)", () => {
  const prevSecret = process.env.BOOKING_LOCK_HMAC_SECRET;

  beforeEach(() => {
    process.env.BOOKING_LOCK_HMAC_SECRET = "vitest-booking-lock-hmac";
  });

  afterEach(() => {
    if (prevSecret === undefined) delete process.env.BOOKING_LOCK_HMAC_SECRET;
    else process.env.BOOKING_LOCK_HMAC_SECRET = prevSecret;
  });

  it("checkout quote hours match unified canonical engine", () => {
    const job = {
      service: "standard" as const,
      rooms: 2,
      bathrooms: 1,
      extraRooms: 1,
      extras: ["inside-oven"],
    };
    const unifiedHours = estimateUnifiedJobDurationHours(job);
    const estimatedHours = estimateJobDurationHoursSnapshot(snap, job);
    const checkout = quoteCheckoutZarWithSnapshot(snap, job, "10:00", "regular", { cleanersCount: 1 });

    expect(estimatedHours).toBe(unifiedHours);
    expect(checkout.hours).toBe(unifiedHours);
    expect(checkout.durationDiagnostics?.canonical_duration_minutes).toBeGreaterThan(0);
  });

  it("time-slot inferred duration matches unified quote hours", () => {
    const job = {
      service: "airbnb" as const,
      rooms: 3,
      bathrooms: 2,
      extraRooms: 1,
      extras: ["inside-fridge", "inside-oven"],
    };

    expect(quoteJobDurationHoursWithSnapshot(snap, job, "regular")).toBe(estimateUnifiedJobDurationHours(job));
    expect(selectLegacyJobDurationMinutes(snap, job)).not.toBe(
      legacyHoursToDurationMinutes(estimateUnifiedJobDurationHours(job)),
    );
  });

  it("keeps lock validation duration anchored to server quote, not client duration", () => {
    const quoted = quoteLockFromRequestBodyWithSnapshot(
      {
        service: "standard",
        rooms: 2,
        bathrooms: 1,
        extraRooms: 0,
        extras: [],
        time: "10:00",
        date: "2026-04-23",
        locationId: LOC,
        duration: 999,
        durationMinutes: 999,
      },
      snap,
    );
    expect(quoted.ok).toBe(true);
    if (!quoted.ok) return;

    const core = slotEligibilityCoreFromLockBody(
      { date: "2026-04-23", locationId: LOC, duration: 999, durationMinutes: 999 },
      {
        timeHm: quoted.timeHm,
        durationHours: quoted.quote.hours,
        catalogServiceId: quoted.job.service,
      },
    );

    expect(core?.durationMinutes).toBe(legacyHoursToDurationMinutes(quoted.quote.hours));
    expect(core?.durationMinutes).not.toBe(999);
  });

  it("lock signature ignores diagnostics metadata", () => {
    const quoted = quoteLockFromRequestBodyWithSnapshot(
      {
        service: "standard",
        rooms: 2,
        bathrooms: 1,
        extraRooms: 0,
        extras: ["inside-oven", "inside-fridge", "inside-cabinets"],
        time: "10:00",
      },
      snap,
    );
    expect(quoted.ok).toBe(true);
    if (!quoted.ok) return;

    const withDiagnostics = buildLockQuoteSignString({
      job: quoted.job,
      timeHm: quoted.timeHm,
      vipTier: quoted.vipTier,
      dynamicAdjustment: quoted.quoteOptions.dynamicAdjustment,
      cleanersCount: quoted.quoteOptions.cleanersCount,
      quote: quoted.quote,
    });
    const withoutDiagnostics = buildLockQuoteSignString({
      job: quoted.job,
      timeHm: quoted.timeHm,
      vipTier: quoted.vipTier,
      dynamicAdjustment: quoted.quoteOptions.dynamicAdjustment,
      cleanersCount: quoted.quoteOptions.cleanersCount,
      quote: { ...quoted.quote, durationDiagnostics: undefined },
    });

    expect(withDiagnostics).toBe(withoutDiagnostics);
  });

  it("checkout validates unified hours on lock recompute", () => {
    const quoted = resolveLegacyBookingQuote(
      {
        service: "standard",
        service_type: "standard_cleaning",
        rooms: 2,
        bathrooms: 1,
        extraRooms: 0,
        extras: [],
        time: "10:00",
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
    const result = validateLockForCheckout(locked, Date.now(), { ratesSnapshot: snap });

    expect(result.ok).toBe(true);
    expect(quoted.quote.hours).toBe(quoted.unified.duration_hours);
    expect(quoted.unified.quote_signature).toHaveLength(64);
  });

  it("keeps selected-cleaner duration parity on the shared locked-duration helper", () => {
    const locked = baseLocked({ finalHours: 1.5, duration: undefined });

    expect(checkoutDurationMinutesFromLocked(locked)).toBe(legacyHoursToDurationMinutes(1.5));
    expect(checkoutDurationMinutesFromLocked(null)).toBe(120);
  });

  it("preserves recurring parity bypass behavior", () => {
    const quoted = quoteLockFromRequestBodyWithSnapshot(
      {
        service: "standard",
        service_type: "standard_cleaning",
        rooms: 2,
        bathrooms: 1,
        extraRooms: 0,
        extras: [],
        time: "10:00",
      },
      snap,
    );
    expect(quoted.ok).toBe(true);
    if (!quoted.ok) return;

    const locked = baseLocked({
      finalPrice: quoted.quote.totalZar + 40,
      finalHours: quoted.quote.hours + 1,
      lockExpiresAt: new Date(Date.now() + LOCK_HOLD_MS).toISOString(),
    });
    const strict = validateLockForCheckout(locked, Date.now(), { ratesSnapshot: snap });
    const recurringBypass = validateLockForCheckout(locked, Date.now(), {
      ratesSnapshot: snap,
      skipPriceDurationParity: true,
    });

    expect(strict.ok).toBe(false);
    if (!strict.ok) expect(["PRICE_MISMATCH", "DURATION_MISMATCH", "SIGNATURE_INVALID"]).toContain(strict.code);
    expect(recurringBypass.ok).toBe(true);
    if (recurringBypass.ok) expect(recurringBypass.visitTotalZar).toBe(Math.round(locked.finalPrice));
  });

  it("runtime quote hours align with canonical workload minutes", () => {
    const job = {
      service: "standard" as const,
      rooms: 2,
      bathrooms: 1,
      extraRooms: 0,
      extras: ["inside-oven", "inside-fridge", "inside-cabinets"],
    };
    const quoted = quoteCheckoutZarWithSnapshot(snap, job, "10:00", "regular", { cleanersCount: 1 });

    expect(quoted.hours).toBe(estimateUnifiedJobDurationHours(job));
    expect(quoted.durationDiagnostics?.canonical_duration_minutes).toBeGreaterThan(0);
  });

  it("legacy tariff hours remain available for locked-booking persistence", () => {
    const job = { service: "standard" as const, rooms: 2, bathrooms: 1, extraRooms: 0, extras: [] as string[] };

    expect(selectLegacyJobDurationHours(snap, job)).toBe(2.7);
    expect(selectLegacyJobDurationMinutes(snap, job)).toBe(162);
    expect(estimateUnifiedJobDurationHours(job)).toBe(4.5);
  });

  it("runtime duration inference flows use unified engine in pricing snapshot", () => {
    const files = {
      pricingEngineSnapshot: readFileSync(path.join(libRoot, "pricing/pricingEngineSnapshot.ts"), "utf8"),
      resolveBookingQuote: readFileSync(path.join(libRoot, "booking/quote/resolveBookingQuote.ts"), "utf8"),
      timeSlotsRoute: readFileSync(path.join(webRoot, "app/api/booking/time-slots/route.ts"), "utf8"),
      canonicalSlotEligibility: readFileSync(path.join(libRoot, "booking/canonicalSlotEligibilityParams.ts"), "utf8"),
      lockedBookingDuration: readFileSync(path.join(libRoot, "booking/lockedBookingDurationMinutes.ts"), "utf8"),
      runBookingLockValidation: readFileSync(path.join(libRoot, "booking/runBookingLockValidation.ts"), "utf8"),
    };

    expect(files.pricingEngineSnapshot).toContain("estimateUnifiedJobDurationHours");
    expect(files.resolveBookingQuote).toContain("resolveLegacyBookingQuote");
    expect(files.resolveBookingQuote).toContain("resolveBookingV2Quote");
    expect(files.timeSlotsRoute).toContain("selectLegacyJobDurationMinutes");
    expect(files.canonicalSlotEligibility).toContain("legacyHoursToDurationMinutes");
    expect(files.lockedBookingDuration).toContain("selectLegacyLockedBookingDurationMinutes");
    expect(files.runBookingLockValidation).toContain("legacyHoursToDurationMinutes");

    for (const [name, src] of Object.entries(files)) {
      expect(src, `${name} should not hand-roll hours-to-minutes conversion`).not.toMatch(
        /Math\.round\([^)]*hours\s*\*\s*60\)/,
      );
    }
  });
});