import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GscDailyPerformanceRow } from "@/lib/gsc/gsc-config";
import { pctChange } from "@/lib/gsc/gsc-config";

export type GscClicksChartPoint = { label: string; value: number; date: string };

export type GscSyncMetaRow = {
  id: string;
  current_start_date: string;
  current_end_date: string;
  previous_start_date: string;
  previous_end_date: string;
  current_clicks: number;
  current_impressions: number;
  previous_clicks: number;
  previous_impressions: number;
  clicks_trend_pct: number | null;
  impressions_trend_pct: number | null;
  clicks_chart: GscClicksChartPoint[];
  synced_at: string;
};

export function formatGscDailyChartPoints(rows: GscDailyPerformanceRow[]): GscClicksChartPoint[] {
  return rows.map((row) => {
    const [, month, day] = row.date.split("-");
    const monthIdx = Number(month) - 1;
    const monthShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][
      monthIdx
    ];
    return {
      date: row.date,
      label: monthShort && day ? `${Number(day)} ${monthShort}` : row.date,
      value: row.clicks,
    };
  });
}

export function buildGscSyncMetaRow(input: {
  currentRange: { startDate: string; endDate: string };
  previousRange: { startDate: string; endDate: string };
  currentClicks: number;
  currentImpressions: number;
  previousClicks: number;
  previousImpressions: number;
  dailyRows: GscDailyPerformanceRow[];
  syncedAt?: string;
}): GscSyncMetaRow {
  return {
    id: "latest",
    current_start_date: input.currentRange.startDate,
    current_end_date: input.currentRange.endDate,
    previous_start_date: input.previousRange.startDate,
    previous_end_date: input.previousRange.endDate,
    current_clicks: input.currentClicks,
    current_impressions: input.currentImpressions,
    previous_clicks: input.previousClicks,
    previous_impressions: input.previousImpressions,
    clicks_trend_pct: pctChange(input.currentClicks, input.previousClicks),
    impressions_trend_pct: pctChange(input.currentImpressions, input.previousImpressions),
    clicks_chart: formatGscDailyChartPoints(input.dailyRows),
    synced_at: input.syncedAt ?? new Date().toISOString(),
  };
}

export async function upsertLocationGscSyncMeta(
  admin: SupabaseClient,
  meta: GscSyncMetaRow,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await admin.from("location_gsc_sync_meta").upsert(meta, { onConflict: "id" });
  if (error) {
    if (error.code === "42P01" || error.message.includes("does not exist")) {
      return {
        ok: false,
        error: "location_gsc_sync_meta table missing — run migration 20261053_location_gsc_period_trends.sql",
      };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
