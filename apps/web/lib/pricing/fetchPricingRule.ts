import type { SupabaseClient } from "@supabase/supabase-js";
import type { DemandLevel } from "@/lib/pricing/marketplaceMultipliers";

export type PricingRuleRow = {
  id: string;
  location: string | null;
  demand_level: string | null;
  base_multiplier: number;
  service_fee_cents: number;
};

/**
 * Best-effort match on `pricing_rules`: location substring, then demand band, then newest.
 */
export function pickBestPricingRuleFromRows(
  rows: PricingRuleRow[],
  params: { location?: string | null; demandLevel?: DemandLevel | null },
): PricingRuleRow | null {
  const loc = (params.location ?? "").trim().toLowerCase();
  const demand = params.demandLevel ?? null;

  let best: PricingRuleRow | null = null;
  let bestScore = -Infinity;

  for (const r of rows) {
    let score = 0;
    const rl = (r.location ?? "").trim().toLowerCase();
    if (rl) {
      if (!loc || (!loc.includes(rl) && !rl.includes(loc))) continue;
      score += 4;
    }
    const rd = (r.demand_level ?? "").trim().toLowerCase();
    if (rd) {
      if (!demand || rd !== demand) continue;
      score += 2;
    }
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }

  if (best) return best;

  for (const r of rows) {
    const rl = (r.location ?? "").trim().toLowerCase();
    const rd = (r.demand_level ?? "").trim().toLowerCase();
    if (!rl && !rd) return r;
  }

  return null;
}

export async function fetchBestPricingRule(
  admin: SupabaseClient,
  params: { location?: string | null; demandLevel?: DemandLevel | null },
): Promise<PricingRuleRow | null> {
  const { data, error } = await admin
    .from("pricing_rules")
    .select("id, location, demand_level, base_multiplier, service_fee_cents")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !data?.length) return null;
  return pickBestPricingRuleFromRows(data as PricingRuleRow[], params);
}
