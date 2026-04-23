import type { BookingServiceId } from "@/components/booking/serviceCategories";
import type { VipTier } from "@/lib/pricing/vipTier";
import type { PricingRatesSnapshot } from "@/lib/pricing/pricingRatesSnapshot";
import {
  JOB_DURATION_QUOTE_ANCHOR_HM,
  normalizePricingJobInput,
  resolveServiceForPricing,
  type CheckoutQuoteResult,
  type PricingJobInput,
} from "@/lib/pricing/pricingEngine";
import {
  computeBundledExtrasTotalZarSnapshot,
  filterExtrasForSnapshot,
  quoteBaseJobZarWithSnapshot,
  quoteCheckoutZarWithSnapshot,
} from "@/lib/pricing/pricingEngineSnapshot";
import { normalizeVipTier } from "@/lib/pricing/vipTier";
import { getServiceBaseZarFromSnapshot } from "@/lib/pricing/pricingConfig";
/** Homepage / live widget service keys (maps 1:1 to `BookingServiceId` except `quick`). */
export type HomeWidgetServiceKey = "standard" | "airbnb" | "deep" | "move" | "carpet";

export type CalculatePriceCatalogInput = PricingJobInput;

export type CalculatePriceCatalogResult = {
  basePrice: number;
  extrasTotal: number;
  finalTotal: number;
  durationHours: number;
  breakdown: CheckoutQuoteResult;
};

/**
 * Single entry point: job dimensions + catalog → ZAR breakdown (same math as checkout).
 */
export function calculatePrice(
  input: CalculatePriceCatalogInput,
  snapshot: PricingRatesSnapshot,
  options?: { timeHm?: string; vipTier?: VipTier | null; cleanersCount?: number },
): CalculatePriceCatalogResult {
  const j = normalizePricingJobInput(input);
  const timeHm = options?.timeHm ?? JOB_DURATION_QUOTE_ANCHOR_HM;
  const tier = normalizeVipTier(options?.vipTier);
  const breakdown = quoteCheckoutZarWithSnapshot(snapshot, j, timeHm, tier, {
    cleanersCount: options?.cleanersCount ?? 1,
  });
  const svc = resolveServiceForPricing(j);
  const baseOnly = quoteBaseJobZarWithSnapshot(snapshot, { ...j, extras: [] });
  const extrasTotal = computeBundledExtrasTotalZarSnapshot(snapshot, j.extras, svc);
  return {
    basePrice: baseOnly.totalZar,
    extrasTotal,
    finalTotal: breakdown.totalZar,
    durationHours: breakdown.hours,
    breakdown,
  };
}

const WIDGET_EXTRA_TO_SLUG: Record<string, string> = {
  fridge: "inside-fridge",
  oven: "inside-oven",
  cabinets: "inside-cabinets",
  windows: "interior-windows",
  walls: "interior-walls",
  plants: "water-plants",
};

function mapWidgetExtrasToSlugs(extras: readonly string[]): string[] {
  return extras.map((e) => WIDGET_EXTRA_TO_SLUG[e] ?? e);
}

export function calculateHomeWidgetQuoteZar(
  input: {
    service: HomeWidgetServiceKey;
    bedrooms: number;
    bathrooms: number;
    extraRooms: number;
    extras: string[];
  },
  snapshot: PricingRatesSnapshot,
): number {
  const slugExtras = mapWidgetExtrasToSlugs(input.extras);
  const job: PricingJobInput = {
    service: input.service,
    serviceType: null,
    rooms: input.bedrooms,
    bathrooms: input.bathrooms,
    extraRooms: input.extraRooms,
    extras: filterExtrasForSnapshot(snapshot, slugExtras, input.service),
  };
  return quoteBaseJobZarWithSnapshot(snapshot, normalizePricingJobInput(job)).totalZar;
}

export function calculateHomeWidgetBaseEstimateZar(
  service: HomeWidgetServiceKey,
  snapshot: PricingRatesSnapshot,
): number {
  return getServiceBaseZarFromSnapshot(snapshot, service);
}
