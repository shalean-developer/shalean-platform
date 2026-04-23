import type { LockedBooking } from "@/lib/booking/lockedBooking";
import { isLockExpired, recomputeLockCheckoutQuote, verifyLockQuoteSignatureForQuote } from "@/lib/booking/lockQuoteSignature";
import type { CheckoutQuoteResult } from "@/lib/pricing/pricingEngine";
import {
  computeJobSubtotalSplitZarSnapshot,
  normalizeJobSubtotalSplitZar,
  type JobSubtotalSplitZar,
} from "@/lib/pricing/pricingEngineSnapshot";
import type { PricingRatesSnapshot } from "@/lib/pricing/pricingRatesSnapshot";
import { PRICING_ENGINE_ALGORITHM_VERSION } from "@/lib/pricing/engineVersion";

/** Bump when lock signature / surge algorithm changes (not when ZAR rows change in Supabase). */
export const BOOKING_CHECKOUT_LOCK_VERSION = PRICING_ENGINE_ALGORITHM_VERSION;

export type CheckoutLockFailureCode =
  | "INVALID_LOCK"
  | "LOCK_EXPIRED"
  | "REQUOTE_REQUIRED"
  | "SIGNATURE_INVALID"
  | "PRICE_MISMATCH"
  | "DURATION_MISMATCH"
  | "QUOTE_MISMATCH"
  | "PRICING_SNAPSHOT_MISSING";

export type CheckoutLockValidateResult =
  | { ok: true; serverQuote: CheckoutQuoteResult | null; visitTotalZar: number; jobSubtotalSplit: JobSubtotalSplitZar }
  | { ok: false; code: CheckoutLockFailureCode; message: string };

/**
 * Checkout truth path: expiry → **recompute** from catalog snapshot →
 * signature (integrity) → numeric parity. Paystack must charge `visitTotalZar` from the recompute path.
 */
export type ValidateLockForCheckoutOptions = {
  skipExpiryCheck?: boolean;
  /** Required — frozen `pricing_versions` row or live DB catalog from {@link resolveRatesSnapshotForLockedBooking}. */
  ratesSnapshot: PricingRatesSnapshot;
  /** Optional `bookings.id` — pricing normalization / drift logs when support traces a row. */
  bookingId?: string | null;
};

function traceBookingId(locked: LockedBooking, override?: string | null): string | null {
  const o = typeof override === "string" ? override.trim() : "";
  if (o) return o;
  const fromLock = typeof locked.booking_id === "string" ? locked.booking_id.trim() : "";
  return fromLock || null;
}

function validateSignedLockV2(
  locked: LockedBooking,
  ratesSnapshot: PricingRatesSnapshot,
  bookingIdOverride?: string | null,
): CheckoutLockValidateResult {
  const rec = recomputeLockCheckoutQuote(locked, ratesSnapshot);
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

  const pricingVersionId =
    typeof locked.pricing_version_id === "string" && locked.pricing_version_id.trim()
      ? locked.pricing_version_id.trim()
      : null;
  const bookingId = traceBookingId(locked, bookingIdOverride);
  const jobSubtotalSplit = normalizeJobSubtotalSplitZar(
    computeJobSubtotalSplitZarSnapshot(ratesSnapshot, job),
    serverQuote.subtotalZar,
    {
      bookingId,
      pricingVersionId,
      pricingCatalogCodeVersion: serverQuote.pricingVersion,
      quoteTotalZar: serverQuote.totalZar,
    },
  );
  return { ok: true, serverQuote, visitTotalZar: serverQuote.totalZar, jobSubtotalSplit };
}

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

  const snap = options?.ratesSnapshot;
  if (!snap) {
    return {
      ok: false,
      code: "PRICING_SNAPSHOT_MISSING",
      message: "Pricing snapshot missing. Refresh the page, then pick your time again before paying.",
    };
  }

  if (typeof locked.pricingVersion === "number" && locked.pricingVersion !== BOOKING_CHECKOUT_LOCK_VERSION) {
    return {
      ok: false,
      code: "REQUOTE_REQUIRED",
      message: "Pricing was updated. Please choose your time again to refresh your quote.",
    };
  }

  return validateSignedLockV2(locked, snap, options?.bookingId);
}
