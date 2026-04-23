/**
 * Location + demand multipliers for marketplace pricing (applied before Paystack lock).
 * Merged with optional `pricing_rules` rows from Supabase in API routes.
 */

export type DemandLevel = "low" | "normal" | "high";

/** Example area premiums — substring match on customer address / area label (case-insensitive). */
const LOCATION_MULTIPLIER_BY_KEYWORD: Array<{ match: string; mult: number }> = [
  { match: "camps bay", mult: 1.3 },
  { match: "city centre", mult: 1.2 },
  { match: "city center", mult: 1.2 },
  { match: "khayelitsha", mult: 0.9 },
  { match: "claremont", mult: 1.15 },
  { match: "sea point", mult: 1.2 },
];

const DEMAND_LEVEL_MULTIPLIER: Record<DemandLevel, number> = {
  low: 1.0,
  normal: 1.1,
  high: 1.3,
};

export function cleanersCountToDemandLevel(cleanersCount: number | null | undefined): DemandLevel {
  const n = typeof cleanersCount === "number" && Number.isFinite(cleanersCount) ? cleanersCount : 0;
  if (n >= 8) return "low";
  if (n >= 4) return "normal";
  return "high";
}

export function getLocationMultiplierFromLabel(location: string | null | undefined): number {
  const s = (location ?? "").trim().toLowerCase();
  if (!s) return 1;
  for (const row of LOCATION_MULTIPLIER_BY_KEYWORD) {
    if (s.includes(row.match)) return row.mult;
  }
  return 1;
}

export function getDemandLevelMultiplier(level: DemandLevel | null | undefined): number {
  if (!level) return DEMAND_LEVEL_MULTIPLIER.normal;
  return DEMAND_LEVEL_MULTIPLIER[level] ?? DEMAND_LEVEL_MULTIPLIER.normal;
}

/**
 * Combined multiplier, clamped to avoid runaway quotes.
 */
export function getMarketplaceMultiplier(params: {
  location?: string | null;
  demandLevel?: DemandLevel | null;
  cleanersCount?: number | null;
  /** Extra factor from `pricing_rules.base_multiplier` (already ≥1 typical). */
  ruleBaseMultiplier?: number | null;
}): number {
  const demand = params.demandLevel ?? cleanersCountToDemandLevel(params.cleanersCount);
  const loc = getLocationMultiplierFromLabel(params.location ?? null);
  const dem = getDemandLevelMultiplier(demand);
  const rule =
    typeof params.ruleBaseMultiplier === "number" && Number.isFinite(params.ruleBaseMultiplier) && params.ruleBaseMultiplier > 0
      ? params.ruleBaseMultiplier
      : 1;
  const raw = loc * dem * rule;
  return Math.min(2.25, Math.max(0.75, Number(raw.toFixed(4))));
}
