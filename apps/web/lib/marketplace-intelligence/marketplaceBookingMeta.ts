import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveMarketplaceClusterId } from "@/lib/marketplace-intelligence/clusterKey";
import { forecastDemand } from "@/lib/marketplace-intelligence/demandForecast";

export type MarketplaceBookingAssignPatch = {
  marketplace_cluster_id: string;
  marketplace_forecast_demand: string | null;
};

/**
 * Cluster key + optional forecast snapshot for persistence on assign.
 * Forecast is skipped unless `MARKETPLACE_FORECAST_ON_ASSIGN=true` (extra DB reads).
 */
export async function marketplaceBookingPatchOnAssign(
  supabase: SupabaseClient,
  row: { date: string | null; time: string | null; location_id: string | null; city_id: string | null },
): Promise<MarketplaceBookingAssignPatch> {
  const dateYmd = String(row.date ?? "").trim();
  const timeHm = String(row.time ?? "").trim().slice(0, 5);
  const loc = String(row.location_id ?? "").trim();
  const clusterId =
    dateYmd && timeHm && loc ? deriveMarketplaceClusterId(dateYmd, timeHm, loc) : "mi_c_unknown";

  let forecast: string | null = null;
  if (process.env.MARKETPLACE_FORECAST_ON_ASSIGN === "true" && dateYmd) {
    const area = String(row.city_id ?? row.location_id ?? "").trim();
    if (area) {
      try {
        const f = await forecastDemand(supabase, dateYmd, area);
        forecast = f.demand_level;
      } catch {
        forecast = null;
      }
    }
  }

  return { marketplace_cluster_id: clusterId, marketplace_forecast_demand: forecast };
}
