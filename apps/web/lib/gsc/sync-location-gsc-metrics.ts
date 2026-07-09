import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildGscDateRange,
  buildGscPreviousDateRange,
  DEFAULT_GSC_CHART_DAYS,
  readGscCredentials,
  readGscSyncDays,
  type GscDateRange,
} from "@/lib/gsc/gsc-config";
import {
  fetchGscDailyLocationPerformance,
  fetchGscPagePerformance,
  GscSearchConsoleError,
} from "@/lib/gsc/search-console";
import { buildGscSyncMetaRow, upsertLocationGscSyncMeta } from "@/lib/gsc/sync-location-gsc-meta";
import { syncLocationGscQueries } from "@/lib/gsc/sync-location-gsc-queries";
import { hubSlugFromGscPageUrl } from "@/lib/seo/gsc-page-import";
import { getAllProgrammaticLocationSlugs } from "@/lib/seo/locations";

export type GscSyncSummary = {
  ok: boolean;
  rowsFetched: number;
  locationRowsMatched: number;
  rowsSaved: number;
  queryRowsFetched: number;
  queryRowsMatched: number;
  queryRowsSaved: number;
  skippedUrls: string[];
  startDate: string;
  endDate: string;
  siteUrl: string | null;
  error?: string;
  queryError?: string;
  metaError?: string;
};

type LocationGscMetricRow = {
  slug: string;
  page_url: string;
  clicks: number;
  impressions: number;
  ctr: number;
  avg_position: number | null;
  prev_clicks: number;
  prev_impressions: number;
  prev_avg_position: number | null;
  synced_at: string;
};

function aggregateGscPageRowsBySlug(
  apiRows: Awaited<ReturnType<typeof fetchGscPagePerformance>>,
): Map<string, { clicks: number; impressions: number; avg_position: number | null; page_url: string }> {
  const validSlugs = new Set<string>(getAllProgrammaticLocationSlugs());
  const bySlug = new Map<string, { clicks: number; impressions: number; avg_position: number | null; page_url: string }>();

  for (const row of apiRows) {
    const slug = hubSlugFromGscPageUrl(row.pageUrl);
    if (!slug || !validSlugs.has(slug)) continue;

    const existing = bySlug.get(slug);
    if (existing) {
      existing.clicks += row.clicks;
      existing.impressions += row.impressions;
      if (row.avgPosition != null && existing.avg_position != null) {
        existing.avg_position = Math.round(((existing.avg_position + row.avgPosition) / 2) * 10) / 10;
      } else if (row.avgPosition != null) {
        existing.avg_position = row.avgPosition;
      }
      continue;
    }

    bySlug.set(slug, {
      page_url: row.pageUrl,
      clicks: row.clicks,
      impressions: row.impressions,
      avg_position: row.avgPosition,
    });
  }

  return bySlug;
}

/** Maps raw GSC page rows to catalog hub slugs (exported for tests). */
export function mapGscPageRowsToLocationMetrics(
  apiRows: Awaited<ReturnType<typeof fetchGscPagePerformance>>,
  prevApiRows: Awaited<ReturnType<typeof fetchGscPagePerformance>> = [],
): { metrics: LocationGscMetricRow[]; skippedUrls: string[] } {
  const validSlugs = new Set<string>(getAllProgrammaticLocationSlugs());
  const skippedUrls: string[] = [];
  const syncedAt = new Date().toISOString();
  const currentBySlug = aggregateGscPageRowsBySlug(apiRows);
  const prevBySlug = aggregateGscPageRowsBySlug(prevApiRows);

  for (const row of apiRows) {
    const slug = hubSlugFromGscPageUrl(row.pageUrl);
    if ((!slug || !validSlugs.has(slug)) && row.pageUrl.includes("/locations/")) {
      skippedUrls.push(row.pageUrl);
    }
  }

  const metrics = [...currentBySlug.entries()].map(([slug, current]) => {
    const prev = prevBySlug.get(slug);
    const clicks = current.clicks;
    const impressions = current.impressions;
    return {
      slug,
      page_url: current.page_url,
      clicks,
      impressions,
      ctr: impressions > 0 ? Math.round((clicks / impressions) * 1_000_000) / 1_000_000 : 0,
      avg_position: current.avg_position,
      prev_clicks: prev?.clicks ?? 0,
      prev_impressions: prev?.impressions ?? 0,
      prev_avg_position: prev?.avg_position ?? null,
      synced_at: syncedAt,
    };
  });

  return { metrics, skippedUrls: [...new Set(skippedUrls)].slice(0, 50) };
}

export async function upsertLocationGscMetrics(
  admin: SupabaseClient,
  metrics: LocationGscMetricRow[],
): Promise<{ rowsSaved: number; error?: string }> {
  if (metrics.length === 0) return { rowsSaved: 0 };

  const { error } = await admin.from("location_gsc_metrics").upsert(metrics, { onConflict: "slug" });
  if (error) {
    if (error.code === "42P01" || error.message.includes("does not exist")) {
      return {
        rowsSaved: 0,
        error: "location_gsc_metrics table missing — run migration 20260960_location_gsc_metrics.sql",
      };
    }
    return { rowsSaved: 0, error: error.message };
  }

  return { rowsSaved: metrics.length };
}

export async function runLocationGscSync(admin: SupabaseClient): Promise<GscSyncSummary> {
  const credentials = readGscCredentials();
  if (!credentials) {
    return {
      ok: false,
      rowsFetched: 0,
      locationRowsMatched: 0,
      rowsSaved: 0,
      queryRowsFetched: 0,
      queryRowsMatched: 0,
      queryRowsSaved: 0,
      skippedUrls: [],
      startDate: "",
      endDate: "",
      siteUrl: null,
      error: "Missing GSC_CLIENT_EMAIL, GSC_PRIVATE_KEY, or GSC_SITE_URL.",
    };
  }

  const days = readGscSyncDays();
  const range: GscDateRange = buildGscDateRange(days);
  const previousRange = buildGscPreviousDateRange(days);
  const chartRange = buildGscDateRange(DEFAULT_GSC_CHART_DAYS);

  try {
    const [apiRows, prevApiRows, dailyRows, querySync] = await Promise.all([
      fetchGscPagePerformance(credentials, range),
      fetchGscPagePerformance(credentials, previousRange),
      fetchGscDailyLocationPerformance(credentials, chartRange),
      syncLocationGscQueries(admin, credentials, range, previousRange),
    ]);
    const { metrics, skippedUrls } = mapGscPageRowsToLocationMetrics(apiRows, prevApiRows);
    const upsert = await upsertLocationGscMetrics(admin, metrics);

    const currentClicks = metrics.reduce((sum, row) => sum + row.clicks, 0);
    const currentImpressions = metrics.reduce((sum, row) => sum + row.impressions, 0);
    const previousClicks = metrics.reduce((sum, row) => sum + row.prev_clicks, 0);
    const previousImpressions = metrics.reduce((sum, row) => sum + row.prev_impressions, 0);
    const meta = buildGscSyncMetaRow({
      currentRange: range,
      previousRange,
      currentClicks,
      currentImpressions,
      previousClicks,
      previousImpressions,
      dailyRows,
    });
    const metaUpsert = await upsertLocationGscSyncMeta(admin, meta);

    if (upsert.error) {
      console.error("[gsc-sync] upsert failed:", upsert.error);
      return {
        ok: false,
        rowsFetched: apiRows.length,
        locationRowsMatched: metrics.length,
        rowsSaved: 0,
        queryRowsFetched: querySync.rowsFetched,
        queryRowsMatched: querySync.rowsMatched,
        queryRowsSaved: querySync.rowsSaved,
        skippedUrls,
        startDate: range.startDate,
        endDate: range.endDate,
        siteUrl: credentials.siteUrl,
        error: upsert.error,
        queryError: querySync.error,
      };
    }

    const pageOk = !upsert.error;
    const queryOk = querySync.ok;
    console.info(
      `[gsc-sync] saved ${upsert.rowsSaved} page rows and ${querySync.rowsSaved} query rows (${range.startDate}..${range.endDate}) for ${credentials.siteUrl}`,
    );

    return {
      ok: pageOk,
      rowsFetched: apiRows.length,
      locationRowsMatched: metrics.length,
      rowsSaved: upsert.rowsSaved,
      queryRowsFetched: querySync.rowsFetched,
      queryRowsMatched: querySync.rowsMatched,
      queryRowsSaved: querySync.rowsSaved,
      skippedUrls,
      startDate: range.startDate,
      endDate: range.endDate,
      siteUrl: credentials.siteUrl,
      queryError: queryOk ? undefined : querySync.error,
      metaError: metaUpsert.ok ? undefined : metaUpsert.error,
    };
  } catch (err) {
    const message =
      err instanceof GscSearchConsoleError
        ? err.message
        : err instanceof Error
          ? err.message
          : "GSC sync failed.";
    console.error("[gsc-sync] fetch failed:", message);
    return {
      ok: false,
      rowsFetched: 0,
      locationRowsMatched: 0,
      rowsSaved: 0,
      queryRowsFetched: 0,
      queryRowsMatched: 0,
      queryRowsSaved: 0,
      skippedUrls: [],
      startDate: range.startDate,
      endDate: range.endDate,
      siteUrl: credentials.siteUrl,
      error: message,
    };
  }
}
