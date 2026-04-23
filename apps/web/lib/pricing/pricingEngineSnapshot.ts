/**
 * Checkout quote path using a frozen {@link PricingRatesSnapshot} (DB `pricing_versions`),
 * so tariff / extras / bundle changes in code do not move locked totals.
 */
import type { BookingServiceId } from "@/components/booking/serviceCategories";
import { devWarn } from "@/lib/logging/devWarn";
import { metrics } from "@/lib/metrics/counters";
import type { PricingRatesSnapshot, SnapshotBundleRow } from "@/lib/pricing/pricingRatesSnapshot";
import type { ServiceTariff } from "@/lib/pricing/pricingConfig";
import type { VipTier } from "@/lib/pricing/vipTier";
import { getVipDiscountMultiplier, getVipDiscountRate, normalizeVipTier } from "@/lib/pricing/vipTier";
import { getSurgeLabel } from "@/lib/pricing/demandSupplySurge";
import {
  clampDynamicMultiplier,
  clampSlotRevenueCoreMultiplier,
  charmPriceZar,
  getDemandTierMultiplier,
  getSlotPricingDemandLabel,
  getSlotTimeMultiplier,
  normalizePricingJobInput,
  resolveServiceForPricing,
  type CheckoutQuoteOptions,
  type CheckoutQuoteResult,
  type PricingJobInput,
} from "@/lib/pricing/pricingEngine";

/** Same anchor as {@link JOB_DURATION_QUOTE_ANCHOR_HM} in `pricingEngine` — duplicated to avoid import cycles. */
const JOB_DURATION_QUOTE_ANCHOR_HM = "10:00" as const;

function tariffFromSnapshot(snapshot: PricingRatesSnapshot, service: BookingServiceId | null): ServiceTariff {
  if (service && snapshot.services[service]) return snapshot.services[service];
  return snapshot.services.standard;
}

export function isExtraAllowedInSnapshot(
  snapshot: PricingRatesSnapshot,
  extraId: string,
  service: BookingServiceId | null,
): boolean {
  if (!service) return false;
  const row = snapshot.extras[extraId];
  if (!row) return false;
  return row.services.includes(service);
}

export function filterExtrasForSnapshot(
  snapshot: PricingRatesSnapshot,
  extraIds: readonly string[],
  service: BookingServiceId | null,
): string[] {
  return extraIds.filter((id) => isExtraAllowedInSnapshot(snapshot, id, service));
}

function retailExtraZar(snapshot: PricingRatesSnapshot, id: string): number {
  return snapshot.extras[id]?.price ?? 0;
}

function bundleAppliesToServiceSnapshot(
  snapshot: PricingRatesSnapshot,
  bundle: SnapshotBundleRow,
  service: BookingServiceId | null,
): boolean {
  if (!service) return false;
  if (bundle.services && !bundle.services.includes(service)) return false;
  return bundle.items.every((id) => isExtraAllowedInSnapshot(snapshot, id, service));
}

function bundlesForServiceSnapshot(snapshot: PricingRatesSnapshot, service: BookingServiceId | null): SnapshotBundleRow[] {
  if (!service) return [];
  return snapshot.bundles.filter((b) => bundleAppliesToServiceSnapshot(snapshot, b, service));
}

export function computeBundledExtrasTotalZarSnapshot(
  snapshot: PricingRatesSnapshot,
  extraIds: readonly string[],
  service: BookingServiceId | null,
): number {
  const valid = filterExtrasForSnapshot(snapshot, extraIds, service);
  const set = new Set(valid.filter((id) => id in snapshot.extras));
  if (set.size === 0) return 0;

  const eligibleBundles = bundlesForServiceSnapshot(snapshot, service);
  const bundleSavings = eligibleBundles
    .map((b) => {
      const retail = b.items.reduce((sum, id) => sum + retailExtraZar(snapshot, id), 0);
      return { b, savings: retail - b.price };
    })
    .sort((a, z) => z.savings - a.savings);

  const remaining = new Set(set);
  let total = 0;
  for (const { b } of bundleSavings) {
    if (b.items.every((id) => remaining.has(id))) {
      total += b.price;
      for (const id of b.items) remaining.delete(id);
    }
  }
  for (const id of remaining) {
    total += retailExtraZar(snapshot, id);
  }
  return total;
}

function extraRoomsLineZarSnapshot(snapshot: PricingRatesSnapshot, job: PricingJobInput): number {
  const j = normalizePricingJobInput(job);
  const cfg = tariffFromSnapshot(snapshot, resolveServiceForPricing(j));
  return j.extraRooms * cfg.extraRoom;
}

export function computeJobSubtotalZarSnapshot(snapshot: PricingRatesSnapshot, job: PricingJobInput): number {
  const j = normalizePricingJobInput(job);
  const service = resolveServiceForPricing(j);
  const cfg = tariffFromSnapshot(snapshot, service);
  const lineBase = service === null ? 0 : cfg.base;
  let base = lineBase + j.rooms * cfg.bedroom + j.bathrooms * cfg.bathroom + extraRoomsLineZarSnapshot(snapshot, j);
  base += computeBundledExtrasTotalZarSnapshot(snapshot, j.extras, service);
  return base;
}

/** Integer ZAR lines that sum to `Math.round(computeJobSubtotalZarSnapshot(...))`. Persisted as `price_breakdown.job`. */
export type JobSubtotalSplitZar = {
  serviceBaseZar: number;
  roomsZar: number;
  extrasZar: number;
};

/** Optional trace fields for normalization logs / metrics (checkout server path). */
export type NormalizeJobSubtotalSplitContext = {
  /** `bookings.id` when known (checkout options or `locked.booking_id`). */
  bookingId?: string | null;
  pricingVersionId?: string | null;
  /** Catalog tariff marker from {@link CheckoutQuoteResult.pricingVersion}. */
  pricingCatalogCodeVersion?: number | null;
  /** Full quote total (ZAR) for sampled logs — job subtotal lines vs invoice total. */
  quoteTotalZar?: number | null;
};

export function jobSplitLineBreakdown(
  serviceBaseZar: number,
  roomsZar: number,
  extrasZar: number,
  subtotalZar: number,
  quoteTotalZar?: number | null,
): { subtotalZar: number; totalZar: number | null; lines: { key: string; amount: number }[] } {
  const lines: { key: string; amount: number }[] = [
    { key: "job_service", amount: serviceBaseZar },
    { key: "job_rooms", amount: roomsZar },
    { key: "job_extras", amount: extrasZar },
  ];
  if (quoteTotalZar != null && Number.isFinite(quoteTotalZar)) {
    lines.push({ key: "quote_total", amount: Math.round(quoteTotalZar) });
  }
  return { subtotalZar, totalZar: quoteTotalZar != null && Number.isFinite(quoteTotalZar) ? Math.round(quoteTotalZar) : null, lines };
}

/** Production: ~10% of routine adjustment lines (metrics stay at 100%). Dev: full fidelity via {@link devWarn}. */
const ROUNDING_ADJUSTMENT_LOG_SAMPLE = 0.1;

function warnRoundingAdjustmentSampled(payload: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "production") {
    if (Math.random() < ROUNDING_ADJUSTMENT_LOG_SAMPLE) {
      console.warn("rounding-adjustment", payload);
    }
    return;
  }
  if (process.env.NODE_ENV === "test") return;
  devWarn("rounding-adjustment", payload);
}

function allocateRoundedParts(raw: readonly [number, number, number], target: number): [number, number, number] {
  const floors: [number, number, number] = [
    Math.floor(raw[0]),
    Math.floor(raw[1]),
    Math.floor(raw[2]),
  ];
  let rem = target - floors[0] - floors[1] - floors[2];
  const order = [0, 1, 2].sort((i, j) => raw[j]! - floors[j]! - (raw[i]! - floors[i]!));
  const out: [number, number, number] = [floors[0], floors[1], floors[2]];
  let k = 0;
  while (rem > 0) {
    out[order[k % 3]!]!++;
    rem--;
    k++;
  }
  return out;
}

export function computeJobSubtotalSplitZarSnapshot(snapshot: PricingRatesSnapshot, job: PricingJobInput): JobSubtotalSplitZar {
  const j = normalizePricingJobInput(job);
  const service = resolveServiceForPricing(j);
  const cfg = tariffFromSnapshot(snapshot, service);
  const lineBase = service === null ? 0 : cfg.base;
  const roomsRaw = j.rooms * cfg.bedroom + j.bathrooms * cfg.bathroom + extraRoomsLineZarSnapshot(snapshot, j);
  const extrasRaw = computeBundledExtrasTotalZarSnapshot(snapshot, j.extras, service);
  const target = Math.round(computeJobSubtotalZarSnapshot(snapshot, j));
  const [serviceBaseZar, roomsZar, extrasZarRaw] = allocateRoundedParts([lineBase, roomsRaw, extrasRaw], target);
  const extrasZar = Math.max(0, extrasZarRaw);
  return { serviceBaseZar, roomsZar, extrasZar };
}

/** Forces `service + rooms + extras === subtotalZar` by nudging extras (persist + UI parity). */
export function normalizeJobSubtotalSplitZar(
  split: JobSubtotalSplitZar,
  subtotalZar: number,
  context?: NormalizeJobSubtotalSplitContext,
): JobSubtotalSplitZar {
  const bookingId =
    typeof context?.bookingId === "string" && context.bookingId.trim() ? context.bookingId.trim() : null;
  metrics.increment("pricing.normalization.total", {
    bookingId,
    pricingVersionId: context?.pricingVersionId ?? null,
  });

  const t = Math.round(subtotalZar);
  let { serviceBaseZar, roomsZar, extrasZar } = split;
  extrasZar = Math.max(0, extrasZar);
  const total = serviceBaseZar + roomsZar + extrasZar;
  const diff = t - total;
  const lineBreakdown = jobSplitLineBreakdown(
    serviceBaseZar,
    roomsZar,
    extrasZar,
    t,
    context?.quoteTotalZar ?? null,
  );
  const logBase = {
    bookingId,
    pricingVersionId: context?.pricingVersionId ?? null,
    pricingCatalogCodeVersion: context?.pricingCatalogCodeVersion ?? null,
    subtotalZar: t,
    service: serviceBaseZar,
    rooms: roomsZar,
    extras: extrasZar,
    diff,
    lineBreakdown,
  };
  if (diff !== 0) {
    warnRoundingAdjustmentSampled(logBase);
    if (Math.abs(diff) > 1) {
      console.warn("rounding-adjustment-high", logBase);
      metrics.increment("pricing.normalization.adjustment_high", logBase);
    }
    metrics.increment("pricing.normalization.applied", logBase);
    extrasZar += diff;
  }
  extrasZar = Math.max(0, extrasZar);
  if (serviceBaseZar + roomsZar + extrasZar !== t) {
    const driftPayload = {
      bookingId,
      pricingVersionId: context?.pricingVersionId ?? null,
      pricingCatalogCodeVersion: context?.pricingCatalogCodeVersion ?? null,
      subtotalZar: t,
      service: serviceBaseZar,
      rooms: roomsZar,
      extras: extrasZar,
      sum: serviceBaseZar + roomsZar + extrasZar,
      initialDiff: diff,
      lineBreakdown: jobSplitLineBreakdown(
        serviceBaseZar,
        roomsZar,
        extrasZar,
        t,
        context?.quoteTotalZar ?? null,
      ),
    };
    console.warn("rounding-adjustment-clamp-drift", driftPayload);
    metrics.increment("pricing.normalization.clamp_drift", driftPayload);
  }
  return { serviceBaseZar, roomsZar, extrasZar };
}

export function estimateJobDurationHoursSnapshot(snapshot: PricingRatesSnapshot, job: PricingJobInput): number {
  const j = normalizePricingJobInput(job);
  const cfg = tariffFromSnapshot(snapshot, resolveServiceForPricing(j));
  const d = cfg.duration;
  const raw = d.base + j.rooms * d.bedroom + j.bathrooms * d.bathroom + j.extraRooms * d.extraRoom;
  return Math.max(2, Math.round(raw * 10) / 10);
}

export function quoteCheckoutZarWithSnapshot(
  snapshot: PricingRatesSnapshot,
  job: PricingJobInput,
  timeHm: string,
  vipTier: VipTier | null | undefined,
  options?: CheckoutQuoteOptions,
): CheckoutQuoteResult {
  const j = normalizePricingJobInput(job);
  const subtotal = computeJobSubtotalZarSnapshot(snapshot, j);
  const hours = estimateJobDurationHoursSnapshot(snapshot, j);
  const extraRoomsNormalized = j.extraRooms;
  const extraRoomsChargeZar = extraRoomsLineZarSnapshot(snapshot, j);
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
    pricingVersion: snapshot.codeVersion,
  };
}

export function quoteBaseJobZarWithSnapshot(
  snapshot: PricingRatesSnapshot,
  job: PricingJobInput,
): { totalZar: number; hours: number } {
  const j = normalizePricingJobInput(job);
  const base = computeJobSubtotalZarSnapshot(snapshot, j);
  return { totalZar: Math.round(base), hours: estimateJobDurationHoursSnapshot(snapshot, j) };
}

export function quoteJobDurationHoursWithSnapshot(
  snapshot: PricingRatesSnapshot,
  job: PricingJobInput,
  vipTier?: VipTier | null | undefined,
  options?: Pick<CheckoutQuoteOptions, "cleanersCount" | "dynamicAdjustment">,
): number {
  return quoteCheckoutZarWithSnapshot(snapshot, job, JOB_DURATION_QUOTE_ANCHOR_HM, vipTier ?? "regular", {
    cleanersCount: options?.cleanersCount ?? 1,
    dynamicAdjustment: options?.dynamicAdjustment ?? 1,
  }).hours;
}
