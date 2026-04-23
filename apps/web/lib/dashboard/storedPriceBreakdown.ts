import { devWarn } from "@/lib/logging/devWarn";
import type { CheckoutQuoteResult } from "@/lib/pricing/pricingEngine";
import { jobSplitLineBreakdown } from "@/lib/pricing/pricingEngineSnapshot";
import { normalizeVipTier } from "@/lib/pricing/vipTier";

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/**
 * Parses `bookings.price_breakdown` written at checkout (spread {@link CheckoutQuoteResult}).
 * Returns null if the payload is missing or not trustworthy.
 */
export function parseStoredPriceBreakdown(raw: unknown): CheckoutQuoteResult | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const totalZar = num(o.totalZar);
  const subtotalZar = num(o.subtotalZar);
  const afterVipSubtotalZar = num(o.afterVipSubtotalZar);
  if (totalZar == null || subtotalZar == null || afterVipSubtotalZar == null) return null;
  if (totalZar < 0 || subtotalZar < 0 || afterVipSubtotalZar < 0) return null;

  const hours = num(o.hours) ?? 0;
  const vipSavingsZar = num(o.vipSavingsZar) ?? 0;
  const effectiveSurgeMultiplier = num(o.effectiveSurgeMultiplier) ?? 1;
  const surgeLabel = typeof o.surgeLabel === "string" && o.surgeLabel.trim() ? o.surgeLabel.trim() : "Adjustments";
  const tier = normalizeVipTier(typeof o.tier === "string" ? o.tier : undefined);
  const demandRaw = typeof o.demandLabel === "string" ? o.demandLabel.toLowerCase() : "";
  const demandLabel: CheckoutQuoteResult["demandLabel"] =
    demandRaw === "peak" || demandRaw === "value" ? demandRaw : "standard";

  return {
    totalZar: Math.round(totalZar),
    subtotalZar: Math.round(subtotalZar),
    afterVipSubtotalZar: Math.round(afterVipSubtotalZar),
    vipSavingsZar: Math.max(0, Math.round(vipSavingsZar)),
    vipSubtotalMultiplier: num(o.vipSubtotalMultiplier) ?? 1,
    hours,
    vipDiscountRate: num(o.vipDiscountRate) ?? 0,
    timeBandMultiplier: num(o.timeBandMultiplier) ?? 1,
    demandTierMultiplier: num(o.demandTierMultiplier) ?? 1,
    slotCoreMultiplier: num(o.slotCoreMultiplier) ?? 1,
    dynamicAdjustment: num(o.dynamicAdjustment) ?? 1,
    effectiveSurgeMultiplier,
    tier,
    demandLabel,
    surgeLabel,
    extraRoomsNormalized: num(o.extraRoomsNormalized) ?? 0,
    extraRoomsChargeZar: Math.round(num(o.extraRoomsChargeZar) ?? 0),
    pricingVersion: Math.round(num(o.pricingVersion) ?? 0),
  };
}

/** Stable keys for list reconciliation (`${bookingId}-price-${kind}`). */
export type DashboardPriceLineKind =
  | "job_service"
  | "job_rooms"
  | "job_extras"
  | "job_combined"
  | "vip_savings"
  | "after_vip_adjustments"
  | "total_paid_fallback";

export type StoredPriceLine = { kind: DashboardPriceLineKind; label: string; amountZar: number };

/** Persisted at checkout as `price_breakdown.job` (ZAR integers, sum = `subtotalZar`). */
export type StoredJobPriceBreakdown = {
  serviceBaseZar: number;
  roomsZar: number;
  extrasZar: number;
};

export type PriceBreakdownLineContext = {
  bookingId?: string | null;
  pricingVersionId?: string | null;
  pricingCatalogCodeVersion?: number | null;
};

export function parseStoredJobPriceBreakdown(raw: unknown): StoredJobPriceBreakdown | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const job = (raw as Record<string, unknown>).job;
  if (job == null || typeof job !== "object" || Array.isArray(job)) return null;
  const o = job as Record<string, unknown>;
  const serviceBaseZar = num(o.serviceBaseZar);
  const roomsZar = num(o.roomsZar);
  const extrasZar = num(o.extrasZar);
  if (serviceBaseZar == null || roomsZar == null || extrasZar == null) return null;
  if (serviceBaseZar < 0 || roomsZar < 0 || extrasZar < 0) return null;
  return {
    serviceBaseZar: Math.round(serviceBaseZar),
    roomsZar: Math.round(roomsZar),
    extrasZar: Math.round(extrasZar),
  };
}

/** Nudge extras so parts sum to `subtotalZar` when within 1 ZAR (rounding / legacy rows). */
export function alignStoredJobSplitToSubtotal(
  job: StoredJobPriceBreakdown,
  subtotalZar: number,
  context?: PriceBreakdownLineContext | null,
): StoredJobPriceBreakdown {
  const t = Math.round(subtotalZar);
  const total = job.serviceBaseZar + job.roomsZar + job.extrasZar;
  if (total === t) return { ...job };
  const diff = t - total;
  const lineBreakdown = jobSplitLineBreakdown(
    job.serviceBaseZar,
    job.roomsZar,
    job.extrasZar,
    t,
    null,
  );
  const logPayload = {
    bookingId: context?.bookingId ?? null,
    pricingVersionId: context?.pricingVersionId ?? null,
    pricingCatalogCodeVersion: context?.pricingCatalogCodeVersion ?? null,
    subtotalZar: t,
    service: job.serviceBaseZar,
    rooms: job.roomsZar,
    extras: job.extrasZar,
    diff,
    lineBreakdown,
  };
  devWarn("rounding-adjustment", logPayload);
  if (Math.abs(diff) > 1) {
    devWarn("rounding-adjustment-high", logPayload);
  }
  let extrasZar = job.extrasZar + diff;
  extrasZar = Math.max(0, extrasZar);
  return {
    serviceBaseZar: job.serviceBaseZar,
    roomsZar: job.roomsZar,
    extrasZar,
  };
}

/**
 * Read-only lines for dashboard — derived only from persisted checkout JSON + locked total.
 * Does not call the pricing engine.
 *
 * Optional: backfill `price_breakdown.job` for legacy bookings (admin script) — unifies UI / analytics when you have time.
 */
export function priceLinesFromStoredCheckoutQuote(
  q: CheckoutQuoteResult,
  lockedTotalZar: number,
  jobSplit: StoredJobPriceBreakdown | null,
  context?: PriceBreakdownLineContext | null,
): StoredPriceLine[] {
  const lines: StoredPriceLine[] = [];
  const sub = q.subtotalZar;
  let usedSplit = false;
  if (jobSplit) {
    const rawSum = jobSplit.serviceBaseZar + jobSplit.roomsZar + jobSplit.extrasZar;
    const maxRaw = Math.max(jobSplit.serviceBaseZar, jobSplit.roomsZar, jobSplit.extrasZar);
    if (maxRaw <= sub && Math.abs(rawSum - sub) <= 1) {
      const aligned = alignStoredJobSplitToSubtotal(jobSplit, sub, context ?? undefined);
      const alignedSum = aligned.serviceBaseZar + aligned.roomsZar + aligned.extrasZar;
      const maxAligned = Math.max(aligned.serviceBaseZar, aligned.roomsZar, aligned.extrasZar);
      if (
        aligned.serviceBaseZar >= 0 &&
        aligned.roomsZar >= 0 &&
        aligned.extrasZar >= 0 &&
        alignedSum === sub &&
        maxAligned <= sub
      ) {
        lines.push({ kind: "job_service", label: "Service base", amountZar: aligned.serviceBaseZar });
        lines.push({ kind: "job_rooms", label: "Rooms", amountZar: aligned.roomsZar });
        lines.push({ kind: "job_extras", label: "Extras", amountZar: aligned.extrasZar });
        usedSplit = true;
      }
    }
  }
  if (!usedSplit) {
    lines.push({
      kind: "job_combined",
      label: "Job subtotal (service, rooms & add-ons)",
      amountZar: q.subtotalZar,
    });
  }

  if (q.vipSavingsZar > 0) {
    lines.push({ kind: "vip_savings", label: "VIP plan savings", amountZar: -q.vipSavingsZar });
  }

  const afterVip = q.afterVipSubtotalZar;
  const postVipToTotal = Math.round(lockedTotalZar) - afterVip;
  if (postVipToTotal !== 0) {
    lines.push({
      kind: "after_vip_adjustments",
      label: `After VIP: time slot, demand & rounding (${q.surgeLabel})`,
      amountZar: postVipToTotal,
    });
  }

  return lines;
}
