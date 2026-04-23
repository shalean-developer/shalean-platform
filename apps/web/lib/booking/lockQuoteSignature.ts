import crypto from "crypto";
import { pricingJobFromLockedBooking } from "@/lib/booking/bookingLockQuote";
import { quoteCheckoutZarWithSnapshot } from "@/lib/pricing/pricingEngineSnapshot";
import type { CheckoutQuoteResult, PricingJobInput } from "@/lib/pricing/pricingEngine";
import type { PricingRatesSnapshot } from "@/lib/pricing/pricingRatesSnapshot";
import { PRICING_ENGINE_ALGORITHM_VERSION } from "@/lib/pricing/engineVersion";
import { resolveBookingLockHmacSecretForSigning } from "@/lib/booking/bookingLockHmacSecret";
import type { VipTier } from "@/lib/pricing/vipTier";
import { normalizeVipTier } from "@/lib/pricing/vipTier";
import type { LockedBooking } from "@/lib/booking/lockedBooking";

/** Hold window returned with lock — checkout must finish inside this window. */
export const LOCK_HOLD_MS = 5 * 60 * 1000;

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((x) => stableStringify(x)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export type LockQuoteSignParams = {
  job: PricingJobInput;
  timeHm: string;
  vipTier: VipTier;
  /** Must match the options passed into `quoteCheckoutZarWithSnapshot` for this quote. */
  dynamicAdjustment: number | undefined;
  cleanersCount: number | undefined;
  quote: CheckoutQuoteResult;
};

/**
 * Canonical string for signing — only pricing inputs + engine output fields that define the charged total.
 */
export function buildLockQuoteSignString(params: LockQuoteSignParams): string {
  const q = params.quote;
  const canonical = {
    v: 2,
    job: {
      service: params.job.service,
      serviceType: params.job.serviceType ?? null,
      rooms: params.job.rooms,
      bathrooms: params.job.bathrooms,
      extraRooms: params.job.extraRooms,
      extras: [...params.job.extras].map((e) => e.trim()).filter(Boolean).sort(),
    },
    timeHm: params.timeHm,
    vipTier: params.vipTier,
    dynamicAdjustment: params.dynamicAdjustment ?? null,
    cleanersCount: params.cleanersCount ?? null,
    quote: {
      totalZar: q.totalZar,
      hours: Number(q.hours.toFixed(4)),
      subtotalZar: q.subtotalZar,
      afterVipSubtotalZar: q.afterVipSubtotalZar,
      vipSavingsZar: q.vipSavingsZar,
      effectiveSurgeMultiplier: Number(q.effectiveSurgeMultiplier.toFixed(6)),
      vipSubtotalMultiplier: q.vipSubtotalMultiplier,
      timeBandMultiplier: q.timeBandMultiplier,
      demandTierMultiplier: q.demandTierMultiplier,
      slotCoreMultiplier: q.slotCoreMultiplier,
      dynamicAdjustment: q.dynamicAdjustment,
      extraRoomsNormalized: q.extraRoomsNormalized,
      extraRoomsChargeZar: q.extraRoomsChargeZar,
      pricingVersion: q.pricingVersion,
    },
  };
  return stableStringify(canonical);
}

/**
 * HMAC-SHA256 of the canonical string. Production requires `BOOKING_LOCK_HMAC_SECRET`;
 * development uses a fixed fallback when unset (see `resolveBookingLockHmacSecretForSigning`).
 */
export function signLockQuoteCanonical(canonical: string): string {
  const secret = resolveBookingLockHmacSecretForSigning();
  return crypto.createHmac("sha256", secret).update(canonical).digest("hex");
}

export function computeLockQuoteSignature(params: LockQuoteSignParams): string {
  return signLockQuoteCanonical(buildLockQuoteSignString(params));
}

function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export type RecomputedLockQuote = {
  job: PricingJobInput;
  timeHm: string;
  vipTier: VipTier;
  dynamicAdjustment: number | undefined;
  cleanersCount: number | undefined;
  quote: CheckoutQuoteResult;
};

export function recomputeLockCheckoutQuote(
  locked: LockedBooking,
  ratesSnapshot: PricingRatesSnapshot,
): RecomputedLockQuote | null {
  if (typeof locked.time !== "string" || !locked.time.trim()) return null;
  const tier = normalizeVipTier(locked.vipTier);
  const { dynamicAdjustment, cleanersCount } = lockQuoteOptionsFromLocked(locked);
  const job = pricingJobFromLockedBooking(locked, ratesSnapshot);
  const timeHm = locked.time.trim().slice(0, 5);
  const quote = quoteCheckoutZarWithSnapshot(ratesSnapshot, job, timeHm, tier, { dynamicAdjustment, cleanersCount });
  return { job, timeHm, vipTier: tier, dynamicAdjustment, cleanersCount, quote };
}

/** Integrity only: canonical(server quote) must match `locked.quoteSignature`. */
export function verifyLockQuoteSignatureForQuote(
  locked: LockedBooking,
  serverQuote: CheckoutQuoteResult,
  ctx: Pick<RecomputedLockQuote, "job" | "timeHm" | "vipTier" | "dynamicAdjustment" | "cleanersCount">,
): boolean {
  if (typeof locked.quoteSignature !== "string" || !/^[0-9a-f]{64}$/i.test(locked.quoteSignature.trim())) {
    return false;
  }
  const expected = computeLockQuoteSignature({
    job: ctx.job,
    timeHm: ctx.timeHm,
    vipTier: ctx.vipTier,
    dynamicAdjustment: ctx.dynamicAdjustment,
    cleanersCount: ctx.cleanersCount,
    quote: serverQuote,
  });
  return timingSafeEqualHex(expected.toLowerCase(), locked.quoteSignature.trim().toLowerCase());
}

function lockQuoteOptionsFromLocked(locked: LockedBooking): {
  dynamicAdjustment: number | undefined;
  cleanersCount: number | undefined;
} {
  const dyn =
    typeof locked.dynamicSurgeFactor === "number" &&
    locked.dynamicSurgeFactor >= 0.8 &&
    locked.dynamicSurgeFactor <= 1.2 &&
    locked.dynamicSurgeFactor !== 1
      ? locked.dynamicSurgeFactor
      : undefined;
  const cleanersCount =
    typeof locked.cleanersCount === "number" && Number.isFinite(locked.cleanersCount)
      ? Math.max(0, Math.round(locked.cleanersCount))
      : undefined;
  return { dynamicAdjustment: dyn, cleanersCount };
}

/**
 * Signed v2 locks: one recompute, then signature integrity + numeric parity vs snapshot.
 * @deprecated Prefer {@link validateLockForCheckout} at payment boundaries.
 */
export function verifyLockQuoteSignature(locked: LockedBooking, ratesSnapshot: PricingRatesSnapshot): boolean {
  if (locked.pricingVersion !== PRICING_ENGINE_ALGORITHM_VERSION) return false;
  const rec = recomputeLockCheckoutQuote(locked, ratesSnapshot);
  if (!rec) return false;
  if (typeof locked.quoteSignature !== "string" || !/^[0-9a-f]{64}$/i.test(locked.quoteSignature.trim())) {
    return false;
  }
  if (!verifyLockQuoteSignatureForQuote(locked, rec.quote, rec)) return false;
  if (Math.abs(locked.finalPrice - rec.quote.totalZar) > 1) return false;
  if (Math.abs(locked.finalHours - rec.quote.hours) > 0.1) return false;
  return true;
}

export function parseLockExpiresAtMs(locked: LockedBooking): number | null {
  if (typeof locked.lockExpiresAt === "string" && locked.lockExpiresAt.trim()) {
    const t = Date.parse(locked.lockExpiresAt);
    if (Number.isFinite(t)) return t;
  }
  const at = Date.parse(locked.lockedAt);
  if (!Number.isFinite(at)) return null;
  return at + LOCK_HOLD_MS;
}

export function isLockExpired(locked: LockedBooking, nowMs: number = Date.now()): boolean {
  const end = parseLockExpiresAtMs(locked);
  if (end == null) return true;
  return nowMs > end;
}
