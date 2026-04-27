import type { SupabaseClient } from "@supabase/supabase-js";
import type { DemandLevelForecast, ForecastDemandResult } from "@/lib/marketplace-intelligence/types";

function dowFromYmd(dateYmd: string): number {
  const t = Date.parse(`${dateYmd}T12:00:00Z`);
  if (!Number.isFinite(t)) return 1;
  return new Date(t).getUTCDay();
}

function areaOrFilter(area: string): string {
  const a = area.trim();
  return `city_id.eq.${a},location_id.eq.${a}`;
}

/**
 * Heuristic demand forecast from recent history (fast COUNT queries).
 * `area` matches either `city_id` or `location_id` on `bookings`.
 */
export async function forecastDemand(
  supabase: SupabaseClient,
  dateYmd: string,
  area: string,
): Promise<ForecastDemandResult> {
  const targetDow = dowFromYmd(dateYmd);
  const sinceIso = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const { count: recentCount, error: e1 } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .gte("created_at", sinceIso)
    .or(areaOrFilter(area))
    .not("status", "eq", "cancelled")
    .not("status", "eq", "payment_expired");

  const { data: dowRows, error: e2 } = await supabase
    .from("bookings")
    .select("date")
    .gte("date", new Date(Date.now() - 56 * 86_400_000).toISOString().slice(0, 10))
    .lte("date", dateYmd)
    .or(areaOrFilter(area))
    .not("status", "eq", "cancelled")
    .not("status", "eq", "payment_expired")
    .limit(400);

  if (e1 || e2) {
    return { demand_level: "medium", predicted_bookings: 0 };
  }

  const recent = recentCount ?? 0;
  let dowMatches = 0;
  for (const row of dowRows ?? []) {
    const d = row && typeof row === "object" && "date" in row ? String((row as { date?: string }).date ?? "") : "";
    if (!d) continue;
    if (dowFromYmd(d) === targetDow) dowMatches++;
  }

  const predicted = Math.max(0, Math.round((recent / 7) * 1.15 + dowMatches / 4));

  let demand_level: DemandLevelForecast = "medium";
  if (predicted >= 18 || recent >= 45) demand_level = "high";
  else if (predicted <= 5 && recent <= 12) demand_level = "low";

  if (targetDow === 5 || targetDow === 6) {
    if (demand_level === "low") demand_level = "medium";
  }

  return { demand_level, predicted_bookings: predicted };
}
