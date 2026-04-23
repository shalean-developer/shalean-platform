import type { BookingStep1State } from "@/components/booking/useBookingStep1";
import { pricingJobFromLockedBooking } from "@/lib/booking/bookingLockQuote";
import type { LockedBooking } from "@/lib/booking/lockedBooking";
import { computeLockQuoteSignature, LOCK_HOLD_MS } from "@/lib/booking/lockQuoteSignature";
import { buildPricingRatesSnapshotFromDb } from "@/lib/pricing/buildPricingRatesSnapshotFromDb";
import { PRICING_ENGINE_ALGORITHM_VERSION } from "@/lib/pricing/engineVersion";
import type { VipTier } from "@/lib/pricing/vipTier";
import { quoteCheckoutZarWithSnapshot } from "@/lib/pricing/pricingEngineSnapshot";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Server-side equivalent of `lockBookingSlot` — builds a validated `LockedBooking` without touching `localStorage`.
 * Use for AI booking agent and programmatic quotes.
 */
export async function buildLockedBookingSnapshot(
  state: BookingStep1State,
  selection: { date: string; time: string },
  options?: { vipTier?: VipTier; dynamicSurgeFactor?: number },
): Promise<LockedBooking> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new Error("buildLockedBookingSnapshot: Supabase admin is not configured.");
  }
  const snapshot = await buildPricingRatesSnapshotFromDb(admin);
  if (!snapshot) {
    throw new Error("buildLockedBookingSnapshot: pricing catalog could not be loaded.");
  }

  const tier = options?.vipTier ?? "regular";
  let dyn = 1;
  if (typeof options?.dynamicSurgeFactor === "number" && Number.isFinite(options.dynamicSurgeFactor)) {
    dyn = Math.min(1.2, Math.max(0.8, options.dynamicSurgeFactor));
  }

  const timeHm = selection.time.trim().slice(0, 5);
  const job = pricingJobFromLockedBooking(
    {
      ...state,
      date: selection.date,
      time: selection.time,
      finalPrice: 0,
      finalHours: 0,
      surge: 1,
      locked: true,
      lockedAt: new Date().toISOString(),
    } as LockedBooking,
    snapshot,
  );
  const q = quoteCheckoutZarWithSnapshot(snapshot, job, timeHm, tier, {
    dynamicAdjustment: dyn === 1 ? undefined : dyn,
  });

  const quoteSignature = computeLockQuoteSignature({
    job,
    timeHm,
    vipTier: tier,
    dynamicAdjustment: dyn === 1 ? undefined : dyn,
    cleanersCount: undefined,
    quote: q,
  });
  const lockExpiresAt = new Date(Date.now() + LOCK_HOLD_MS).toISOString();

  const locked: LockedBooking = {
    ...state,
    date: selection.date,
    time: selection.time,
    finalPrice: q.totalZar,
    finalHours: q.hours,
    price: q.totalZar,
    duration: q.hours,
    surge: q.effectiveSurgeMultiplier,
    surgeLabel: q.surgeLabel,
    vipTier: tier,
    quoteSignature,
    lockExpiresAt,
    pricingVersion: q.pricingVersion ?? PRICING_ENGINE_ALGORITHM_VERSION,
    locked: true,
    lockedAt: new Date().toISOString(),
  };

  if (dyn !== 1) {
    locked.dynamicSurgeFactor = dyn;
  }

  return locked;
}
