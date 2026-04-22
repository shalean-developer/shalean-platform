import { getDemandPricingLabel, getDemandSurgeMultiplier } from "@/lib/pricing/slotSurge";

export type SlotLabelKind = "best-value" | "high-demand" | "recommended" | "almost-full" | "most-booked";

/**
 * At most one primary label per time: demand band → price leader → surge → popularity.
 */
export function computeSlotLabels(
  orderedTimes: readonly string[],
  byTime: Record<string, number>,
): Record<string, SlotLabelKind | null> {
  const out: Record<string, SlotLabelKind | null> = {};
  for (const t of orderedTimes) out[t] = null;

  if (orderedTimes.length === 0) return out;

  for (const t of orderedTimes) {
    const band = getDemandPricingLabel(t);
    if (band === "peak") out[t] = "high-demand";
    else if (band === "value") out[t] = "best-value";
  }

  let bestT = orderedTimes[0]!;
  let minP = byTime[bestT] ?? Infinity;
  for (const t of orderedTimes) {
    const p = byTime[t];
    if (p != null && p < minP) {
      minP = p;
      bestT = t;
    }
  }
  if (out[bestT] == null) out[bestT] = "best-value";

  const surgeSorted = [...orderedTimes]
    .filter((t) => t !== bestT && getDemandSurgeMultiplier(t) >= 1.15)
    .sort((a, b) => getDemandSurgeMultiplier(b) - getDemandSurgeMultiplier(a));

  for (const t of surgeSorted.slice(0, 2)) {
    if (out[t] == null) out[t] = "almost-full";
  }

  const popularityOrder = ["10:00", "13:00", "15:00", "11:00", "14:00"] as const;
  let popular = 0;
  for (const t of popularityOrder) {
    if (popular >= 2) break;
    if (!orderedTimes.includes(t)) continue;
    if (out[t] != null) continue;
    out[t] = "most-booked";
    popular++;
  }

  let rec = 0;
  for (const t of orderedTimes) {
    if (rec >= 1) break;
    if (out[t] != null) continue;
    if (getDemandPricingLabel(t) === "standard") {
      out[t] = "recommended";
      rec++;
    }
  }

  return out;
}

export function findLowestPriceTime(
  orderedTimes: readonly string[],
  byTime: Record<string, number>,
): string | null {
  if (orderedTimes.length === 0) return null;
  let best = orderedTimes[0]!;
  let min = byTime[best] ?? Infinity;
  for (const t of orderedTimes) {
    const p = byTime[t];
    if (p != null && p < min) {
      min = p;
      best = t;
    }
  }
  return best;
}
