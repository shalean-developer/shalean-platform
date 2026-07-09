import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GscClicksChartPoint, GscSyncMetaRow } from "@/lib/gsc/sync-location-gsc-meta";

export type ResolvedGscSyncMeta = {
  currentStartDate: string;
  currentEndDate: string;
  previousStartDate: string;
  previousEndDate: string;
  currentClicks: number;
  currentImpressions: number;
  previousClicks: number;
  previousImpressions: number;
  clicksTrendPct: number | null;
  impressionsTrendPct: number | null;
  clicksChart: GscClicksChartPoint[];
  syncedAt: string | null;
};

function toNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function loadLocationGscSyncMeta(admin: SupabaseClient): Promise<ResolvedGscSyncMeta | null> {
  const { data, error } = await admin.from("location_gsc_sync_meta").select("*").eq("id", "latest").maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.message.includes("does not exist")) {
      return null;
    }
    console.error("[gsc-meta] database read failed:", error.message);
    return null;
  }

  if (!data) return null;

  const row = data as GscSyncMetaRow;
  const clicksChart = Array.isArray(row.clicks_chart) ? row.clicks_chart : [];

  return {
    currentStartDate: row.current_start_date,
    currentEndDate: row.current_end_date,
    previousStartDate: row.previous_start_date,
    previousEndDate: row.previous_end_date,
    currentClicks: row.current_clicks,
    currentImpressions: row.current_impressions,
    previousClicks: row.previous_clicks,
    previousImpressions: row.previous_impressions,
    clicksTrendPct: toNumber(row.clicks_trend_pct),
    impressionsTrendPct: toNumber(row.impressions_trend_pct),
    clicksChart,
    syncedAt: row.synced_at,
  };
}
