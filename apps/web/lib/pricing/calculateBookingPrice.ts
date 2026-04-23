/**
 * Frontend pricing entry for the booking funnel — job totals and duration only.
 * Availability (`/api/booking/time-slots`) must not run this; it receives `duration` minutes only.
 */
import type { BookingServiceId } from "@/components/booking/serviceCategories";
import { extrasLineItemsForService, filterExtrasForService, type ExtraLineItem } from "@/lib/pricing/extrasConfig";
import type { VipTier } from "@/lib/pricing/vipTier";
import { normalizeVipTier } from "@/lib/pricing/vipTier";
import {
  JOB_DURATION_QUOTE_ANCHOR_HM,
  normalizePricingJobInput,
  parsePricingServiceParams,
  resolveServiceForPricing,
  type CheckoutQuoteResult,
  type PricingJobInput,
} from "@/lib/pricing/pricingEngine";
import type { PricingRatesSnapshot } from "@/lib/pricing/pricingRatesSnapshot";
import { quoteCheckoutZarWithSnapshot } from "@/lib/pricing/pricingEngineSnapshot";

export type CalculateBookingPriceInput = {
  /** Funnel key, e.g. `standard_cleaning`, or a raw service id like `standard`. */
  serviceType?: string | null;
  service?: BookingServiceId | null;
  bedrooms: number;
  bathrooms: number;
  extraRooms?: number;
  extras: string[];
  vipTier?: VipTier | null;
};

export type CalculateBookingPriceResult = {
  totalPrice: number;
  durationHours: number;
  /** Full line-item snapshot at the anchor time (same engine as `/api/booking/lock`). */
  breakdown: CheckoutQuoteResult;
  /** Selected add-ons with labels and ZAR (per line; bundle discounts in `breakdown` only). */
  extrasLineItems: ExtraLineItem[];
  /** Normalized job row — reuse for per-slot quotes on the client. */
  job: PricingJobInput;
};

/**
 * Headline quote at a neutral anchor time + supply (for “from” / summaries).
 * Per-slot totals use {@link quoteCheckoutZarWithSnapshot} with each slot’s `HH:mm` and `cleanersCount`.
 */
export function calculateBookingPrice(
  input: CalculateBookingPriceInput,
  snapshot: PricingRatesSnapshot,
): CalculateBookingPriceResult | null {
  const rawKey = String(input.serviceType ?? input.service ?? "").trim();
  if (!rawKey) return null;
  const parsed = parsePricingServiceParams(rawKey);
  const rooms = Math.max(1, Math.round(Number(input.bedrooms) || 1));
  const bathrooms = Math.max(1, Math.round(Number(input.bathrooms) || 1));
  const extraRooms = input.extraRooms ?? 0;
  const tier = normalizeVipTier(input.vipTier);

  const draft: PricingJobInput = {
    service: parsed.service,
    serviceType: parsed.serviceType,
    rooms,
    bathrooms,
    extraRooms,
    extras: [],
  };
  const resolved = resolveServiceForPricing(draft);
  const job = normalizePricingJobInput({
    ...draft,
    extras: filterExtrasForService(Array.isArray(input.extras) ? input.extras : [], resolved, snapshot),
  });

  const breakdown = quoteCheckoutZarWithSnapshot(snapshot, job, JOB_DURATION_QUOTE_ANCHOR_HM, tier, {
    cleanersCount: 1,
  });
  const resolvedSvc = resolveServiceForPricing(job);
  const extrasLineItems = extrasLineItemsForService(job.extras, resolvedSvc, snapshot);

  return {
    totalPrice: breakdown.totalZar,
    durationHours: breakdown.hours,
    breakdown,
    extrasLineItems,
    job,
  };
}
