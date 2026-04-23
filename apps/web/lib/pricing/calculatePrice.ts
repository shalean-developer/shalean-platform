/**
 * Back-compat facade over `pricingEngine` for widgets and previews.
 * Checkout locks must use `POST /api/booking/lock` (server `quoteCheckoutZar`).
 */
import type { BookingServiceId } from "@/components/booking/serviceCategories";
import type { VipTier } from "@/lib/pricing/vipTier";
import type { PricingJobInput } from "@/lib/pricing/pricingEngine";
import { computeBundledExtrasTotalZar } from "@/lib/pricing/extrasConfig";
import { EXTRAS_ZAR as ENGINE_EXTRAS_ZAR, quoteBaseJobZar, quoteCheckoutZar, SERVICE_BASE_ZAR } from "@/lib/pricing/pricingEngine";

export type CalculatePriceInput = PricingJobInput;

/** @deprecated Import from `@/lib/pricing/pricingEngine` — re-exported for callers. */
export { SERVICE_BASE_ZAR, EXTRAS_ZAR } from "@/lib/pricing/pricingEngine";

/** Short ids used by the homepage widget optional-extras catalog. */
export type WidgetOptionalExtraId = "fridge" | "oven" | "cabinets" | "windows" | "walls" | "plants";

export const WIDGET_OPTIONAL_EXTRA_PRICES: Record<WidgetOptionalExtraId, number> = {
  fridge: ENGINE_EXTRAS_ZAR["inside-fridge"] ?? 0,
  oven: ENGINE_EXTRAS_ZAR["inside-oven"] ?? 0,
  cabinets: ENGINE_EXTRAS_ZAR["inside-cabinets"] ?? 0,
  windows: ENGINE_EXTRAS_ZAR["interior-windows"] ?? 0,
  walls: ENGINE_EXTRAS_ZAR["interior-walls"] ?? 0,
  plants: ENGINE_EXTRAS_ZAR["water-plants"] ?? 0,
};

/** Pre–surge extras sum (bundled when applicable) — split display for locked totals only. */
export function sumExtrasSubtotal(extras: string[], service?: BookingServiceId | null): number {
  return computeBundledExtrasTotalZar(extras, service ?? null);
}

/**
 * Client-side estimate (step 1 sidebar) — base only, no VIP or demand surge
 * (surge depends on slot picked in step 2).
 */
export function calculatePrice(input: CalculatePriceInput): { total: number; hours: number } {
  const { totalZar, hours } = quoteBaseJobZar(input);
  return { total: totalZar, hours };
}

export type SmartQuoteResult = {
  /** Final ZAR (rounded) — what we lock and charge before tip/promo */
  total: number;
  /** Pre-discount, pre-surge subtotal */
  baseTotal: number;
  /** VIP loyalty discount rate 0–0.15 */
  discount: number;
  /** Combined multiplier: time × supply × dynamic (after VIP discount applied to subtotal) */
  surge: number;
  hours: number;
  tier: VipTier;
  demandLabel: "peak" | "value" | "standard";
  surgeLabel: string;
  /** Billable extra-room count (after engine normalization). */
  extraRoomsNormalized: number;
  /** ZAR for extra rooms only (`extraRoom` × count; not add-ons). */
  extraRoomsChargeZar: number;
  afterVipSubtotalZar: number;
  vipSavingsZar: number;
  vipSubtotalMultiplier: number;
};

export type SmartQuoteOptions = {
  /**
   * AI / dynamic pricing layer on top of base demand surge. Clamped to [0.8, 1.2] at call sites.
   * Default 1 — web checkout unchanged when omitted.
   */
  dynamicAdjustment?: number;
  /** Roster density at slot — optional; omit for quotes without cleaner counts */
  cleanersCount?: number | null;
};

/**
 * Full quote: VIP loyalty + time surge + optional supply + optional dynamic adjustment.
 */
export function calculateSmartQuote(
  input: CalculatePriceInput,
  timeHm: string,
  userTier: VipTier | null | undefined,
  options?: SmartQuoteOptions,
): SmartQuoteResult {
  const q = quoteCheckoutZar(input, timeHm, userTier, {
    dynamicAdjustment: options?.dynamicAdjustment,
    cleanersCount: options?.cleanersCount,
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

/** Homepage / live widget service keys (maps 1:1 to `BookingServiceId` except `quick`). */
export type HomeWidgetServiceKey = "standard" | "airbnb" | "deep" | "move" | "carpet";

export type HomeWidgetQuoteInput = {
  service: HomeWidgetServiceKey;
  bedrooms: number;
  bathrooms: number;
  extraRooms: number;
  extras: string[];
};

export function calculateHomeWidgetQuoteZar(input: HomeWidgetQuoteInput): number {
  const { total } = calculatePrice({
    service: input.service,
    rooms: input.bedrooms,
    bathrooms: input.bathrooms,
    extraRooms: input.extraRooms,
    extras: input.extras,
  });
  return total;
}

export function calculateHomeWidgetBaseEstimateZar(service: HomeWidgetServiceKey): number {
  return SERVICE_BASE_ZAR[service] ?? 0;
}

/** Introspection / admin — raw job subtotal before surge. */
export { computeJobSubtotalZar, quoteJobDurationHours } from "@/lib/pricing/pricingEngine";
