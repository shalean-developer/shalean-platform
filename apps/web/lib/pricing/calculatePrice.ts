/**
 * Back-compat facade — all quotes require a {@link PricingRatesSnapshot} from `/api/pricing/catalog` or admin DB build.
 */
import type { BookingServiceId } from "@/components/booking/serviceCategories";
import { normalizeVipTier, type VipTier } from "@/lib/pricing/vipTier";
import type { PricingJobInput } from "@/lib/pricing/pricingEngine";
import type { PricingRatesSnapshot } from "@/lib/pricing/pricingRatesSnapshot";
import {
  computeBundledExtrasTotalZarSnapshot,
  quoteBaseJobZarWithSnapshot,
  quoteCheckoutZarWithSnapshot,
} from "@/lib/pricing/pricingEngineSnapshot";
import {
  calculateHomeWidgetBaseEstimateZar,
  calculateHomeWidgetQuoteZar,
  type HomeWidgetServiceKey,
} from "@/lib/pricing/calculateCatalogPrice";
import { normalizePricingJobInput } from "@/lib/pricing/pricingEngine";

export type { HomeWidgetServiceKey } from "@/lib/pricing/calculateCatalogPrice";

export type CalculatePriceInput = PricingJobInput;

/** Short ids used by the homepage widget optional-extras catalog. */
export type WidgetOptionalExtraId = "fridge" | "oven" | "cabinets" | "windows" | "walls" | "plants";

const WIDGET_SLUG: Record<WidgetOptionalExtraId, string> = {
  fridge: "inside-fridge",
  oven: "inside-oven",
  cabinets: "inside-cabinets",
  windows: "interior-windows",
  walls: "interior-walls",
  plants: "water-plants",
};

export function getWidgetOptionalExtraPrices(snapshot: PricingRatesSnapshot): Record<WidgetOptionalExtraId, number> {
  return {
    fridge: snapshot.extras[WIDGET_SLUG.fridge]?.price ?? 0,
    oven: snapshot.extras[WIDGET_SLUG.oven]?.price ?? 0,
    cabinets: snapshot.extras[WIDGET_SLUG.cabinets]?.price ?? 0,
    windows: snapshot.extras[WIDGET_SLUG.windows]?.price ?? 0,
    walls: snapshot.extras[WIDGET_SLUG.walls]?.price ?? 0,
    plants: snapshot.extras[WIDGET_SLUG.plants]?.price ?? 0,
  };
}

/** @deprecated Use {@link getWidgetOptionalExtraPrices} with a catalog snapshot. */
export const WIDGET_OPTIONAL_EXTRA_PRICES: Record<WidgetOptionalExtraId, number> = {
  fridge: 0,
  oven: 0,
  cabinets: 0,
  windows: 0,
  walls: 0,
  plants: 0,
};

/** Pre–surge extras sum (bundled when applicable). */
export function sumExtrasSubtotal(
  extras: string[],
  service: BookingServiceId | null,
  snapshot: PricingRatesSnapshot,
): number {
  return computeBundledExtrasTotalZarSnapshot(snapshot, extras, service);
}

/**
 * Client-side estimate (step 1 sidebar) — base only, no VIP or demand surge
 * (surge depends on slot picked in step 2).
 */
export function calculatePrice(
  input: CalculatePriceInput,
  snapshot: PricingRatesSnapshot,
): { total: number; hours: number } {
  const j = normalizePricingJobInput(input);
  const { totalZar, hours } = quoteBaseJobZarWithSnapshot(snapshot, j);
  return { total: totalZar, hours };
}

export type SmartQuoteResult = {
  total: number;
  baseTotal: number;
  discount: number;
  surge: number;
  hours: number;
  tier: VipTier;
  demandLabel: "peak" | "value" | "standard";
  surgeLabel: string;
  extraRoomsNormalized: number;
  extraRoomsChargeZar: number;
  afterVipSubtotalZar: number;
  vipSavingsZar: number;
  vipSubtotalMultiplier: number;
};

export type SmartQuoteOptions = {
  dynamicAdjustment?: number;
  cleanersCount?: number | null;
};

export function calculateSmartQuote(
  input: CalculatePriceInput,
  snapshot: PricingRatesSnapshot,
  timeHm: string,
  userTier: VipTier | null | undefined,
  options?: SmartQuoteOptions,
): SmartQuoteResult {
  const j = normalizePricingJobInput(input);
  const q = quoteCheckoutZarWithSnapshot(snapshot, j, timeHm, normalizeVipTier(userTier), {
    dynamicAdjustment: options?.dynamicAdjustment,
    cleanersCount: options?.cleanersCount ?? undefined,
  });
  return {
    total: q.totalZar,
    baseTotal: q.subtotalZar,
    discount: q.vipDiscountRate,
    surge: q.effectiveSurgeMultiplier,
    hours: q.hours,
    tier: q.tier,
    demandLabel: q.demandLabel,
    surgeLabel: q.surgeLabel,
    extraRoomsNormalized: q.extraRoomsNormalized,
    extraRoomsChargeZar: q.extraRoomsChargeZar,
    afterVipSubtotalZar: q.afterVipSubtotalZar,
    vipSavingsZar: q.vipSavingsZar,
    vipSubtotalMultiplier: q.vipSubtotalMultiplier,
  };
}

export type HomeWidgetQuoteInput = {
  service: HomeWidgetServiceKey;
  bedrooms: number;
  bathrooms: number;
  extraRooms: number;
  extras: string[];
};

export { calculateHomeWidgetQuoteZar, calculateHomeWidgetBaseEstimateZar } from "@/lib/pricing/calculateCatalogPrice";

export { quoteJobDurationHoursWithSnapshot as quoteJobDurationHours } from "@/lib/pricing/pricingEngineSnapshot";
export { computeJobSubtotalZarSnapshot as computeJobSubtotalZar } from "@/lib/pricing/pricingEngineSnapshot";
