/**
 * Dynamic pricing rules — pure functions. DB persistence happens in `/api/cron/ai-optimize`.
 * Safety: each step moves multipliers by at most 10% toward target band; absolute clamp [0.8, 1.2].
 */

export const PRICING_ADJUSTMENT_MIN = 0.8;
export const PRICING_ADJUSTMENT_MAX = 1.2;
export const LOW_CONVERSION_THRESHOLD = 0.2;
export const HIGH_CONVERSION_THRESHOLD = 0.5;
export const STEP_FACTOR = 0.9; // decrease 10%
export const STEP_FACTOR_UP = 1.1; // increase 10%

export type SlotMetricRow = {
  slot_time: string;
  conversion_rate: number;
  views_count?: number;
  bookings_count?: number;
  drop_offs?: number;
};

export type SlotAdjustmentRow = {
  slot_time: string;
  multiplier: number;
};

/**
 * Given current conversion rate vs thresholds, return the next multiplier (before global clamp).
 */
export function computeNextMultiplier(
  currentMultiplier: number,
  conversionRate: number,
): number {
  let next = currentMultiplier;
  if (conversionRate < LOW_CONVERSION_THRESHOLD) {
    next = currentMultiplier * STEP_FACTOR;
  } else if (conversionRate > HIGH_CONVERSION_THRESHOLD) {
    next = currentMultiplier * STEP_FACTOR_UP;
  }
  return clampMultiplier(next);
}

export function optimizationReason(conversionRate: number): string {
  if (conversionRate < LOW_CONVERSION_THRESHOLD) return "low_conversion_discount";
  if (conversionRate > HIGH_CONVERSION_THRESHOLD) return "high_conversion_premium";
  return "stable_band";
}

export function clampMultiplier(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(PRICING_ADJUSTMENT_MAX, Math.max(PRICING_ADJUSTMENT_MIN, n));
}

export type OptimizationResult = {
  slot_time: string;
  previousMultiplier: number;
  nextMultiplier: number;
  conversionRate: number;
  reason: string;
}[];

/**
 * Run one optimization pass over metrics + current adjustments.
 */
export function runPricingOptimizationPass(
  metrics: SlotMetricRow[],
  adjustments: SlotAdjustmentRow[],
): OptimizationResult {
  const byAdj = new Map(adjustments.map((a) => [a.slot_time, a.multiplier]));
  const out: OptimizationResult = [];

  for (const m of metrics) {
    const prev = clampMultiplier(byAdj.get(m.slot_time) ?? 1);
    const next = computeNextMultiplier(prev, m.conversion_rate);
    const reason = optimizationReason(m.conversion_rate);

    out.push({
      slot_time: m.slot_time,
      previousMultiplier: prev,
      nextMultiplier: next,
      conversionRate: m.conversion_rate,
      reason,
    });
  }

  return out;
}
