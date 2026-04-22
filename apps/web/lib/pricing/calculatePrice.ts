import type { BookingServiceId, BookingServiceTypeKey } from "@/components/booking/serviceCategories";
import { bookingServiceIdFromType } from "@/components/booking/serviceCategories";
import type { VipTier } from "@/lib/pricing/vipTier";
import { VIP_DISCOUNTS } from "@/lib/pricing/vipTier";
import { getDemandSurgeMultiplier, getDemandPricingLabel } from "@/lib/pricing/slotSurge";

export type CalculatePriceInput = {
  service: BookingServiceId | null;
  /** Funnel key — used when `service` is null, or kept in sync with `service` from step state. */
  serviceType?: BookingServiceTypeKey | null;
  rooms: number;
  bathrooms: number;
  extraRooms: number;
  extras: string[];
};

function resolveServiceForPricing(input: CalculatePriceInput): BookingServiceId | null {
  if (input.service) return input.service;
  if (input.serviceType) return bookingServiceIdFromType(input.serviceType);
  return null;
}

const SERVICE_BASE_ZAR: Record<BookingServiceId, number> = {
  quick: 150,
  standard: 200,
  airbnb: 220,
  deep: 300,
  carpet: 280,
  move: 290,
};

const ROOM_RATE = 40;
const BATHROOM_RATE = 30;
const EXTRA_ROOM_RATE = 20;

export const EXTRAS_ZAR: Record<string, number> = {
  "inside-cabinets": 40,
  "inside-fridge": 30,
  "inside-oven": 50,
  "interior-windows": 60,
  ironing: 40,
};

/** Pre–surge extras sum — used only to split the locked total for display (does not change `finalPrice`). */
export function sumExtrasSubtotal(extras: string[]): number {
  let s = 0;
  for (const id of extras) {
    s += EXTRAS_ZAR[id] ?? 0;
  }
  return s;
}

function computeBaseTotal(input: CalculatePriceInput): number {
  const service = resolveServiceForPricing(input);
  const { rooms, bathrooms, extraRooms, extras } = input;

  let base = 0;
  if (service !== null) {
    base += SERVICE_BASE_ZAR[service] ?? 0;
  }

  base += rooms * ROOM_RATE;
  base += bathrooms * BATHROOM_RATE;
  base += extraRooms * EXTRA_ROOM_RATE;

  for (const id of extras) {
    base += EXTRAS_ZAR[id] ?? 0;
  }

  return base;
}

function computeHours(input: CalculatePriceInput): number {
  const { rooms, bathrooms, extraRooms } = input;
  return Math.max(
    2,
    Math.round((rooms * 1 + bathrooms * 0.5 + extraRooms * 0.25) * 10) / 10,
  );
}

/**
 * Client-side estimate (step 1 sidebar) — base only, no VIP or demand surge
 * (surge depends on slot picked in step 2).
 */
export function calculatePrice(input: CalculatePriceInput): { total: number; hours: number } {
  const base = computeBaseTotal(input);
  return { total: Math.round(base), hours: computeHours(input) };
}

export type SmartQuoteResult = {
  /** Final ZAR (rounded) — what we lock and charge before tip/promo */
  total: number;
  /** Pre-discount, pre-surge subtotal */
  baseTotal: number;
  /** VIP loyalty discount rate 0–0.15 */
  discount: number;
  /** Demand multiplier (e.g. 1.2 peak, 0.9 value) */
  surge: number;
  hours: number;
  tier: VipTier;
  demandLabel: "peak" | "value" | "standard";
};

export type SmartQuoteOptions = {
  /**
   * AI / dynamic pricing layer on top of base demand surge. Clamped to [0.8, 1.2] at call sites.
   * Default 1 — web checkout unchanged when omitted.
   */
  dynamicAdjustment?: number;
};

/**
 * Full quote: VIP loyalty + demand surge (+ optional dynamic adjustment). Use when a time slot is chosen.
 */
export function calculateSmartQuote(
  input: CalculatePriceInput,
  timeHm: string,
  userTier: VipTier | null | undefined,
  options?: SmartQuoteOptions,
): SmartQuoteResult {
  const baseTotal = computeBaseTotal(input);
  const hours = computeHours(input);
  const tier = userTier ?? "regular";
  const discount = VIP_DISCOUNTS[tier] ?? 0;
  const afterDiscount = baseTotal * (1 - discount);
  const surge = getDemandSurgeMultiplier(timeHm);
  const dyn =
    typeof options?.dynamicAdjustment === "number" && Number.isFinite(options.dynamicAdjustment)
      ? options.dynamicAdjustment
      : 1;
  const total = Math.round(afterDiscount * surge * dyn);

  return {
    total,
    baseTotal: Math.round(baseTotal),
    discount,
    surge,
    hours,
    tier,
    demandLabel: getDemandPricingLabel(timeHm),
  };
}
