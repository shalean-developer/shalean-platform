import type { RawAvailabilitySlot } from "@/lib/booking/enrichAvailabilitySlots";
import { getDemandTierMultiplier, getSlotTimeMultiplier } from "@/lib/pricing/pricingEngine";
import type { PricingJobInput } from "@/lib/pricing/pricingEngine";
import type { PricingRatesSnapshot } from "@/lib/pricing/pricingRatesSnapshot";
import type { VipTier } from "@/lib/pricing/vipTier";
import { quoteCheckoutZarWithSnapshot } from "@/lib/pricing/pricingEngineSnapshot";

export type SlotPriceEntry = { price: number; isEstimated: boolean };

const exactPriceCache = new Map<string, SlotPriceEntry>();
const MAX_CACHE_ENTRIES = 400;

function exactCacheKey(
  snapshot: PricingRatesSnapshot,
  fingerprint: string,
  vipTier: VipTier,
  slot: Pick<RawAvailabilitySlot, "time" | "cleanersCount">,
): string {
  const cc = Math.max(0, Math.round(slot.cleanersCount));
  return `${snapshot.codeVersion}|${fingerprint}|${vipTier}|${slot.time}|${cc}|ex`;
}

function exactCacheSet(key: string, value: SlotPriceEntry): void {
  if (exactPriceCache.size >= MAX_CACHE_ENTRIES) {
    const first = exactPriceCache.keys().next().value;
    if (first !== undefined) exactPriceCache.delete(first);
  }
  exactPriceCache.set(key, value);
}

function estimatePriceFromAnchor(anchorPrice: number, slot: RawAvailabilitySlot): number {
  const timeMultiplier = getSlotTimeMultiplier(slot.time);
  const demandMultiplier = getDemandTierMultiplier(Math.max(0, Math.round(slot.cleanersCount)));
  const estimatedMultiplier = timeMultiplier * demandMultiplier;
  const estimatedPrice = Math.round(anchorPrice * estimatedMultiplier);
  return Math.max(anchorPrice * 0.85, Math.min(anchorPrice * 1.2, estimatedPrice));
}

/**
 * One full {@link quoteCheckoutZarWithSnapshot} at a mid-list anchor; other slots use lightweight
 * time × demand estimates (clamped). Selection / {@link refineSlotPricesExact} use full quotes.
 */
export function loadSlotPricesParallel(
  slots: readonly RawAvailabilitySlot[],
  job: PricingJobInput,
  snapshot: PricingRatesSnapshot,
  vipTier: VipTier,
  _fingerprint: string,
): Promise<Record<string, SlotPriceEntry>> {
  const available = slots.filter((s) => s.available);
  if (available.length === 0) return Promise.resolve({});

  const anchorIdx = Math.floor(available.length / 2);
  const anchorSlot = available[anchorIdx] ?? available[0]!;
  const anchorCc = Math.max(0, Math.round(anchorSlot.cleanersCount));
  const anchorQuote = quoteCheckoutZarWithSnapshot(snapshot, job, anchorSlot.time, vipTier, {
    cleanersCount: anchorCc,
  });
  const anchorPrice = anchorQuote.totalZar;

  const out: Record<string, SlotPriceEntry> = {};
  for (let i = 0; i < available.length; i++) {
    const s = available[i]!;
    if (i === anchorIdx) {
      out[s.time] = { price: anchorPrice, isEstimated: false };
      continue;
    }
    out[s.time] = { price: estimatePriceFromAnchor(anchorPrice, s), isEstimated: true };
  }
  return Promise.resolve(out);
}

/** Full engine quotes for specific times (e.g. background refinement). */
export async function refineSlotPricesExact(
  slots: readonly RawAvailabilitySlot[],
  times: readonly string[],
  job: PricingJobInput,
  snapshot: PricingRatesSnapshot,
  vipTier: VipTier,
  fingerprint: string,
): Promise<Record<string, SlotPriceEntry>> {
  const byTime = new Map(slots.map((s) => [s.time, s]));
  const results = await Promise.all(
    times.map(async (time) => {
      const s = byTime.get(time);
      if (!s?.available) return null;
      const key = exactCacheKey(snapshot, fingerprint, vipTier, s);
      const hit = exactPriceCache.get(key);
      if (hit) return { time, entry: hit };
      const q = quoteCheckoutZarWithSnapshot(snapshot, job, s.time, vipTier, {
        cleanersCount: Math.max(0, Math.round(s.cleanersCount)),
      });
      const entry: SlotPriceEntry = { price: q.totalZar, isEstimated: false };
      exactCacheSet(key, entry);
      return { time, entry };
    }),
  );
  const patch: Record<string, SlotPriceEntry> = {};
  for (const r of results) {
    if (r) patch[r.time] = r.entry;
  }
  return patch;
}

/** Single-slot exact quote (e.g. on user tap); uses same cache as refinement. */
export function quoteSlotPriceExact(
  slot: RawAvailabilitySlot,
  job: PricingJobInput,
  snapshot: PricingRatesSnapshot,
  vipTier: VipTier,
  fingerprint: string,
): SlotPriceEntry {
  if (!slot.available) return { price: 0, isEstimated: false };
  const key = exactCacheKey(snapshot, fingerprint, vipTier, slot);
  const hit = exactPriceCache.get(key);
  if (hit) return hit;
  const q = quoteCheckoutZarWithSnapshot(snapshot, job, slot.time, vipTier, {
    cleanersCount: Math.max(0, Math.round(slot.cleanersCount)),
  });
  const entry: SlotPriceEntry = { price: q.totalZar, isEstimated: false };
  exactCacheSet(key, entry);
  return entry;
}
