import type { LockedBooking } from "@/lib/booking/lockedBooking";
import {
  isLockExpired,
  recomputeLockCheckoutQuote,
  verifyLockQuoteSignatureForQuote,
} from "@/lib/booking/lockQuoteSignature";
import type { CheckoutQuoteResult } from "@/lib/pricing/pricingEngine";
import { quoteBaseJobZar, quoteCheckoutZar } from "@/lib/pricing/pricingEngine";
import { PRICING_CONFIG } from "@/lib/pricing/pricingConfig";
import { normalizeVipTier } from "@/lib/pricing/vipTier";

/** Tariff / lock schema — bump `PRICING_CONFIG.version` to invalidate stale holds after rate changes. */
export const BOOKING_CHECKOUT_LOCK_VERSION = PRICING_CONFIG.version;

export type CheckoutLockFailureCode =
  | "INVALID_LOCK"
  | "LOCK_EXPIRED"
  | "REQUOTE_REQUIRED"
  | "SIGNATURE_INVALID"
  | "PRICE_MISMATCH"
  | "DURATION_MISMATCH"
  | "QUOTE_MISMATCH";

export type CheckoutLockValidateResult =
  | { ok: true; serverQuote: CheckoutQuoteResult | null; visitTotalZar: number }
  | { ok: false; code: CheckoutLockFailureCode; message: string };

/** Pre–demand-pricing per-slot map — validating legacy `booking_locked` payloads only. */
const LEGACY_SLOT_SURGE_MAP: Record<string, number> = {
  "08:00": 1.2,
  "09:00": 1.1,
  "10:00": 1.0,
  "13:00": 1.05,
  "14:00": 1.1,
};

function legacySurge(time: string): number {
  const m = LEGACY_SLOT_SURGE_MAP[time];
  return typeof m === "number" && Number.isFinite(m) ? m : 1;
}

function validateLegacyLockedPrice(locked: LockedBooking): boolean {
  const input = {
    service: locked.service,
    serviceType: locked.service_type,
    rooms: locked.rooms,
    bathrooms: locked.bathrooms,
    extraRooms: locked.extraRooms,
    extras: locked.extras,
  };

  const { totalZar: baseTotal } = quoteBaseJobZar(input);

  if (locked.vipTier != null && typeof locked.time === "string" && locked.time.trim()) {
    const tier = normalizeVipTier(locked.vipTier);
    const dyn =
      typeof locked.dynamicSurgeFactor === "number" &&
      locked.dynamicSurgeFactor >= 0.8 &&
      locked.dynamicSurgeFactor <= 1.2
        ? locked.dynamicSurgeFactor
        : 1;
    const q = quoteCheckoutZar(input, locked.time, tier, {
      dynamicAdjustment: dyn,
      cleanersCount: locked.cleanersCount,
    });
    const priceOk = Math.abs(q.totalZar - locked.finalPrice) <= 1;
    const hoursOk = Math.abs(q.hours - locked.finalHours) <= 0.1;
    return priceOk && hoursOk;
  }

  const legacy = Math.round(baseTotal * legacySurge(locked.time));
  return Math.abs(legacy - locked.finalPrice) <= 1;
}

/**
 * Checkout truth path: expiry → lock schema version → **recompute** → signature (integrity) →
 * numeric parity (truth vs snapshot). Paystack must charge `visitTotalZar` from the recompute path.
 */
export type ValidateLockForCheckoutOptions = {
  /** When true, skip hold window check (e.g. non-payment validation of quote math only). */
  skipExpiryCheck?: boolean;
};

export function validateLockForCheckout(
  locked: LockedBooking,
  nowMs: number = Date.now(),
  options?: ValidateLockForCheckoutOptions,
): CheckoutLockValidateResult {
  if (!Number.isFinite(locked.finalPrice) || locked.finalPrice < 1) {
    return { ok: false, code: "INVALID_LOCK", message: "Invalid booking lock." };
  }
  if (!Number.isFinite(locked.finalHours) || locked.finalHours <= 0) {
    return { ok: false, code: "INVALID_LOCK", message: "Invalid booking lock." };
  }

  if (!options?.skipExpiryCheck && isLockExpired(locked, nowMs)) {
    return {
      ok: false,
      code: "LOCK_EXPIRED",
      message: "Your price hold expired. Choose a time again to refresh your quote.",
    };
  }

  if (locked.pricingVersion === BOOKING_CHECKOUT_LOCK_VERSION) {
    const rec = recomputeLockCheckoutQuote(locked);
    if (!rec) {
      return { ok: false, code: "INVALID_LOCK", message: "Invalid booking lock." };
    }

    const { quote: serverQuote, job, timeHm, vipTier, dynamicAdjustment, cleanersCount } = rec;

    const hasSig =
      typeof locked.quoteSignature === "string" && /^[0-9a-f]{64}$/i.test(locked.quoteSignature.trim());

    if (hasSig) {
      const sigOk = verifyLockQuoteSignatureForQuote(locked, serverQuote, {
        job,
        timeHm,
        vipTier,
        dynamicAdjustment,
        cleanersCount,
      });
      if (!sigOk) {
        return {
          ok: false,
          code: "SIGNATURE_INVALID",
          message: "This quote could not be verified. Please choose your time again.",
        };
      }
    }

    if (Math.abs(serverQuote.totalZar - locked.finalPrice) > 1) {
      return {
        ok: false,
        code: "PRICE_MISMATCH",
        message: "Price updated due to changes in availability or demand. Please re-lock your slot.",
      };
    }

    if (Math.abs(serverQuote.hours - locked.finalHours) > 0.1) {
      return {
        ok: false,
        code: "DURATION_MISMATCH",
        message: "Visit length no longer matches this quote. Please re-lock your slot.",
      };
    }

    return { ok: true, serverQuote, visitTotalZar: serverQuote.totalZar };
  }

  if (typeof locked.pricingVersion === "number" && locked.pricingVersion !== BOOKING_CHECKOUT_LOCK_VERSION) {
    return {
      ok: false,
      code: "REQUOTE_REQUIRED",
      message: "Pricing was updated. Please choose your time again to refresh your quote.",
    };
  }

  if (!validateLegacyLockedPrice(locked)) {
    return {
      ok: false,
      code: "QUOTE_MISMATCH",
      message: "Quote no longer matches. Update your booking and try again.",
    };
  }

  const rec = recomputeLockCheckoutQuote(locked);
  if (rec) {
    if (Math.abs(rec.quote.totalZar - locked.finalPrice) <= 1 && Math.abs(rec.quote.hours - locked.finalHours) <= 0.1) {
      return { ok: true, serverQuote: rec.quote, visitTotalZar: rec.quote.totalZar };
    }
  }

  return { ok: true, serverQuote: null, visitTotalZar: locked.finalPrice };
}
