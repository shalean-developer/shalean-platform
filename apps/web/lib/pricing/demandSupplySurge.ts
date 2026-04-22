import type { SupabaseClient } from "@supabase/supabase-js";

export function getSurgeMultiplier(input: { demand: number; supply: number }): number {
  const demand = Math.max(0, Math.floor(Number(input.demand) || 0));
  const supply = Math.max(0, Math.floor(Number(input.supply) || 0));
  if (supply === 0) return 2.0;

  const ratio = demand / supply;
  if (ratio < 0.5) return 1.0;
  if (ratio < 1) return 1.1;
  if (ratio < 1.5) return 1.2;
  if (ratio < 2) return 1.4;
  if (ratio < 3) return 1.6;
  return 1.8;
}

export function clampSurgeMultiplier(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.min(2.0, Math.max(1.0, v));
}

export function getSurgeLabel(multiplier: number): string {
  if (multiplier >= 1.6) return "Limited cleaners available";
  if (multiplier > 1) return "High demand";
  return "Standard pricing";
}

export async function getDemandSupplySnapshot(supabase: SupabaseClient): Promise<{
  demand: number;
  supply: number;
  multiplier: number;
}> {
  return getDemandSupplySnapshotByCity(supabase, null);
}

export async function getDemandSupplySnapshotByCity(
  supabase: SupabaseClient,
  cityId: string | null,
): Promise<{
  demand: number;
  supply: number;
  multiplier: number;
}> {
  let demandQuery = supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .in("dispatch_status", ["searching", "offered", "failed"]);
  let supplyQuery = supabase.from("cleaners").select("id", { count: "exact", head: true }).eq("is_available", true);
  if (cityId) {
    demandQuery = demandQuery.eq("city_id", cityId);
    supplyQuery = supplyQuery.eq("city_id", cityId);
  }

  const [demandRes, supplyRes] = await Promise.all([demandQuery, supplyQuery]);
  const demand = Math.max(0, demandRes.count ?? 0);
  const supply = Math.max(0, supplyRes.count ?? 0);
  const multiplier = clampSurgeMultiplier(getSurgeMultiplier({ demand, supply }));
  return { demand, supply, multiplier };
}
