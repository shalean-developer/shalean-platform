/**
 * Demand-based multiplier by clock hour (arrival time HH:MM, 24h).
 * Evening peak vs mid-morning value window — tunable for revenue vs retention.
 */
export function parseHourFromHm(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  if (!Number.isFinite(h) || h < 0 || h > 23) return null;
  return h;
}

/** @returns label for UI: peak demand, best value, or standard */
export function getDemandPricingLabel(time: string): "peak" | "value" | "standard" {
  const h = parseHourFromHm(time);
  if (h == null) return "standard";
  if (h >= 17 && h <= 19) return "peak";
  if (h >= 9 && h <= 11) return "value";
  return "standard";
}

/**
 * Demand surge (time-based). Combines with VIP loyalty discount in `calculateSmartQuote`.
 */
export function getDemandSurgeMultiplier(time: string): number {
  const h = parseHourFromHm(time);
  if (h == null) return 1;
  if (h >= 17 && h <= 19) return 1.2;
  if (h >= 9 && h <= 11) return 0.9;
  return 1;
}

/** @deprecated Use getDemandSurgeMultiplier — kept alias for gradual migration */
export function getSurgeMultiplier(time: string): number {
  return getDemandSurgeMultiplier(time);
}

export function computeSurgedFinalPrice(baseTotal: number, time: string): number {
  return Math.round(baseTotal * getDemandSurgeMultiplier(time));
}
