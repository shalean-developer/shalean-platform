/**
 * Back-compat re-exports — revenue multipliers live in `pricingEngine.ts`.
 */
import { getSlotPricingDemandLabel, getSlotTimeMultiplier } from "@/lib/pricing/pricingEngine";

export const getDemandSurgeMultiplier = getSlotTimeMultiplier;
export const getDemandPricingLabel = getSlotPricingDemandLabel;

/** @deprecated Use getDemandSurgeMultiplier */
export function getSurgeMultiplier(time: string): number {
  return getSlotTimeMultiplier(time);
}

export function parseHourFromHm(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  if (!Number.isFinite(h) || h < 0 || h > 23) return null;
  return h;
}

export function computeSurgedFinalPrice(baseTotal: number, time: string): number {
  return Math.round(baseTotal * getSlotTimeMultiplier(time));
}
