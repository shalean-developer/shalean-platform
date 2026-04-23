/**
 * Single source of truth for marketplace job pricing (ZAR).
 * Slot revenue: demand tier × time band (clamped) × optional dynamic layer, then charm rounding.
 */
import type { BookingServiceId, BookingServiceTypeKey } from "@/components/booking/serviceCategories";
import { bookingServiceIdFromType } from "@/components/booking/serviceCategories";
import type { VipTier } from "@/lib/pricing/vipTier";
import { getVipDiscountMultiplier, getVipDiscountRate, normalizeVipTier } from "@/lib/pricing/vipTier";
import { getSurgeLabel } from "@/lib/pricing/demandSupplySurge";
import { computeBundledExtrasTotalZar } from "@/lib/pricing/extrasConfig";
import { PRICING_CONFIG, tariffForPricingService } from "@/lib/pricing/pricingConfig";

/**
 * Job dimensions for pricing. `extraRooms` is always a non‑negative integer at runtime
 * after {@link normalizePricingJobInput} (never null/undefined in engine math).
 */
export type PricingJobInput = {
  service: BookingServiceId | null;
  serviceType?: BookingServiceTypeKey | null;
  rooms: number;
  bathrooms: number;
  extraRooms: number;
  extras: string[];
};

const EXTRA_ROOMS_CAP = 10;

/** Coerce any client/API value to a safe integer extra-room count. */
export function normalizeExtraRoomsRaw(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(EXTRA_ROOMS_CAP, Math.round(n)));
}

/** Canonical job row for all quote paths (slots, lock, validation). */
export function normalizePricingJobInput(input: PricingJobInput): PricingJobInput {
  const rooms = Math.max(1, Math.round(Number.isFinite(input.rooms) ? Number(input.rooms) : 1));
  const bathrooms = Math.max(1, Math.round(Number.isFinite(input.bathrooms) ? Number(input.bathrooms) : 1));
  return {
    service: input.service,
    serviceType: input.serviceType ?? null,
    rooms,
    bathrooms,
    extraRooms: normalizeExtraRoomsRaw(input.extraRooms),
    extras: Array.isArray(input.extras)
      ? input.extras.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim())
      : [],
  };
}

const SERVICE_ID_SET = new Set<BookingServiceId>(["quick", "standard", "airbnb", "deep", "carpet", "move"]);
const SERVICE_TYPE_SET = new Set<BookingServiceTypeKey>([
  "standard_cleaning",
  "airbnb_cleaning",
  "deep_cleaning",
  "move_cleaning",
  "carpet_cleaning",
]);

/** Accepts funnel `*_cleaning` keys or raw `BookingServiceId` strings from APIs. */
export function parsePricingServiceParams(
  raw: string,
): Pick<PricingJobInput, "service" | "serviceType"> {
  const r = raw.trim();
  if (SERVICE_ID_SET.has(r as BookingServiceId)) {
    return { service: r as BookingServiceId, serviceType: null };
  }
  if (SERVICE_TYPE_SET.has(r as BookingServiceTypeKey)) {
    return { service: null, serviceType: r as BookingServiceTypeKey };
  }
  return { service: null, serviceType: null };
}

export function resolveServiceForPricing(job: PricingJobInput): BookingServiceId | null {
  if (job.service) return job.service;
  if (job.serviceType) return bookingServiceIdFromType(job.serviceType);
  return null;
}

/** Base visit fee by service (ZAR) — derived from {@link PRICING_CONFIG}. */
export const SERVICE_BASE_ZAR: Record<BookingServiceId, number> = {
  quick: PRICING_CONFIG.services.quick.base,
  standard: PRICING_CONFIG.services.standard.base,
  airbnb: PRICING_CONFIG.services.airbnb.base,
  deep: PRICING_CONFIG.services.deep.base,
  carpet: PRICING_CONFIG.services.carpet.base,
  move: PRICING_CONFIG.services.move.base,
};

/** Re-export catalog prices — use {@link computeBundledExtrasTotalZar} for line totals with bundles. */
export { EXTRAS_ZAR } from "@/lib/pricing/extrasConfig";

function extraRoomsLineZar(j: PricingJobInput): number {
  const n = normalizePricingJobInput(j).extraRooms;
  const cfg = tariffForPricingService(resolveServiceForPricing(j));
  return n * cfg.extraRoom;
}

export function computeJobSubtotalZar(job: PricingJobInput): number {
  const j = normalizePricingJobInput(job);
  const service = resolveServiceForPricing(j);
  const cfg = tariffForPricingService(service);
  const lineBase = service === null ? 0 : cfg.base;
  let base = lineBase + j.rooms * cfg.bedroom + j.bathrooms * cfg.bathroom + extraRoomsLineZar(j);
  base += computeBundledExtrasTotalZar(j.extras, resolveServiceForPricing(j));
  return base;
}

/**
 * Billable visit length (hours), lower bounded — **only** used inside {@link quoteCheckoutZar} /
 * {@link quoteBaseJobZar}. Callers must use `quoteCheckoutZar(...).hours` or {@link quoteJobDurationHours}.
 */
export function estimateJobDurationHours(job: PricingJobInput): number {
  const j = normalizePricingJobInput(job);
  const cfg = tariffForPricingService(resolveServiceForPricing(j));
  const d = cfg.duration;
  const raw = d.base + j.rooms * d.bedroom + j.bathrooms * d.bathroom + j.extraRooms * d.extraRoom;
  return Math.max(2, Math.round(raw * 10) / 10);
}

function parseHourFromHm(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  if (!Number.isFinite(h) || h < 0 || h > 23) return null;
  return h;
}

/**
 * Time-of-day value curve (arrival HH:mm).
 * 09:00–11:00 = conversion window (discount); early start = small premium.
 */
export function getSlotTimeMultiplier(timeHm: string): number {
  const h = parseHourFromHm(timeHm);
  if (h == null) return 1.05;
  if (h < 8) return 1.1;
  if (h >= 9 && h <= 11) return 0.9;
  return 1.05;
}

/**
 * Supply / demand tier from roster count at the slot.
 * Unknown count → neutral medium (1.05).
 */
export function getDemandTierMultiplier(cleanersCount: number | null | undefined): number {
  if (cleanersCount == null || !Number.isFinite(cleanersCount)) return 1.05;
  const n = Math.floor(Number(cleanersCount));
  if (n <= 0) return 1.05;
  if (n <= 1) return 1.25;
  if (n <= 3) return 1.15;
  if (n <= 5) return 1.05;
  return 0.95;
}

/** @deprecated Use `getDemandTierMultiplier` — kept for older imports */
export function supplyPressureMultiplier(cleanersCount: number | null | undefined): number {
  return getDemandTierMultiplier(cleanersCount);
}

export function clampSlotRevenueCoreMultiplier(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(1.3, Math.max(0.85, n));
}

/** Psychology: R462 → R459, R518 → R519 */
export function charmPriceZar(raw: number): number {
  const r = Math.max(1, Math.round(raw));
  const x = Math.round(r / 10) * 10 - 1;
  return Math.max(1, x);
}

/** UI band for slot copy (aligned with time + demand story). */
export function getSlotPricingDemandLabel(timeHm: string): "peak" | "value" | "standard" {
  const h = parseHourFromHm(timeHm);
  if (h == null) return "standard";
  if (h < 8) return "peak";
  if (h >= 9 && h <= 11) return "value";
  if (h >= 17 && h <= 19) return "peak";
  return "standard";
}

export function clampDynamicMultiplier(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(1.2, Math.max(0.8, n));
}

export type CheckoutQuoteOptions = {
  dynamicAdjustment?: number;
  cleanersCount?: number | null;
};

/**
 * Canonical read for visit hours outside a per-slot quote. Uses {@link quoteCheckoutZar} so
 * duration always matches lock/checkout/slots (time band and supply do not change `hours`).
 */
export const JOB_DURATION_QUOTE_ANCHOR_HM = "10:00" as const;

export function quoteJobDurationHours(
  job: PricingJobInput,
  vipTier?: VipTier | null | undefined,
  options?: Pick<CheckoutQuoteOptions, "cleanersCount" | "dynamicAdjustment">,
): number {
  return quoteCheckoutZar(job, JOB_DURATION_QUOTE_ANCHOR_HM, vipTier ?? "regular", {
    cleanersCount: options?.cleanersCount ?? 1,
    dynamicAdjustment: options?.dynamicAdjustment ?? 1,
  }).hours;
}

export type CheckoutQuoteResult = {
  totalZar: number;
  /** Job line-items before VIP (same as historical `subtotalZar`). */
  subtotalZar: number;
  /** Subtotal after VIP, before demand/time/dynamic/charm (rounded ZAR). */
  afterVipSubtotalZar: number;
  /** Rounded ZAR saved vs guest for this job subtotal (0 for regular). */
  vipSavingsZar: number;
  /** Multiplier applied to subtotal for VIP (1 = guest). */
  vipSubtotalMultiplier: number;
  hours: number;
  vipDiscountRate: number;
  /** Time band multiplier (before clamp with demand). */
  timeBandMultiplier: number;
  /** Demand tier from cleaner roster. */
  demandTierMultiplier: number;
  /** `clamp(demand × time)` before dynamic AI layer */
  slotCoreMultiplier: number;
  dynamicAdjustment: number;
  /** slotCore × dynamic — pre-charm; use for surge copy */
  effectiveSurgeMultiplier: number;
  tier: VipTier;
  demandLabel: "peak" | "value" | "standard";
  surgeLabel: string;
  /** Billable extra-room count after normalization (trust / breakdown). */
  extraRoomsNormalized: number;
  /** ZAR for extra rooms only (`extraRoom` × count; separate from add-ons). */
  extraRoomsChargeZar: number;
  /** Tariff row — must match persisted `LockedBooking.pricingVersion` for checkout. */
  pricingVersion: typeof PRICING_CONFIG.version;
};

/**
 * Full checkout quote: subtotal → VIP → clamp(demand×time) → dynamic → charm total.
 */
export function quoteCheckoutZar(
  job: PricingJobInput,
  timeHm: string,
  vipTier: VipTier | null | undefined,
  options?: CheckoutQuoteOptions,
): CheckoutQuoteResult {
  const j = normalizePricingJobInput(job);
  const subtotal = computeJobSubtotalZar(j);
  const hours = estimateJobDurationHours(j);
  const extraRoomsNormalized = j.extraRooms;
  const extraRoomsChargeZar = extraRoomsLineZar(j);
  const tier = normalizeVipTier(vipTier === null || vipTier === undefined ? undefined : String(vipTier));
  const vipSubtotalMultiplier = getVipDiscountMultiplier(tier);
  const afterVip = subtotal * vipSubtotalMultiplier;
  const vipDiscountRate = getVipDiscountRate(tier);
  const subtotalRounded = Math.round(subtotal);
  const afterVipSubtotalZar = Math.round(afterVip);
  const vipSavingsZar = Math.max(0, subtotalRounded - afterVipSubtotalZar);

  const timeBandMultiplier = getSlotTimeMultiplier(timeHm);
  const demandTierMultiplier = getDemandTierMultiplier(options?.cleanersCount);
  const slotCoreMultiplier = clampSlotRevenueCoreMultiplier(demandTierMultiplier * timeBandMultiplier);

  const dynamicAdjustment = clampDynamicMultiplier(
    typeof options?.dynamicAdjustment === "number" ? options.dynamicAdjustment : 1,
  );
  const effectiveSurgeMultiplier = slotCoreMultiplier * dynamicAdjustment;

  const rawTotal = afterVip * effectiveSurgeMultiplier;
  const totalZar = charmPriceZar(Math.round(rawTotal));

  return {
    totalZar,
    subtotalZar: subtotalRounded,
    afterVipSubtotalZar,
    vipSavingsZar,
    vipSubtotalMultiplier,
    hours,
    vipDiscountRate,
    timeBandMultiplier,
    demandTierMultiplier,
    slotCoreMultiplier,
    dynamicAdjustment,
    effectiveSurgeMultiplier,
    tier,
    demandLabel: getSlotPricingDemandLabel(timeHm),
    surgeLabel: getSurgeLabel(effectiveSurgeMultiplier),
    extraRoomsNormalized,
    extraRoomsChargeZar,
    pricingVersion: PRICING_CONFIG.version,
  };
}

/** Base-only line (no surge) — homepage / early funnel. */
export function quoteBaseJobZar(job: PricingJobInput): { totalZar: number; hours: number } {
  const j = normalizePricingJobInput(job);
  const base = computeJobSubtotalZar(j);
  return { totalZar: Math.round(base), hours: estimateJobDurationHours(j) };
}
