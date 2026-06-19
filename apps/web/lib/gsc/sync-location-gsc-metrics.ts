import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildGscDateRange,
  readGscCredentials,
  readGscSyncDays,
  type GscDateRange,
} from "@/lib/gsc/gsc-config";
import { fetchGscPagePerformance, GscSearchConsoleError } from "@/lib/gsc/search-console";
import { hubSlugFromGscPageUrl } from "@/lib/seo/gsc-page-import";
import { getAllProgrammaticLocationSlugs } from "@/lib/seo/locations";

export type GscSyncSummary = {
  ok: boolean;
  rowsFetched: number;
  locationRowsMatched: number;
  rowsSaved: number;
  skippedUrls: string[];
  startDate: string;
  endDate: string;
  siteUrl: string | null;
  error?: string;
};

type LocationGscMetricRow = {
  slug: string;
  page_url: string;
  clicks: number;
  impressions: number;
  ctr: number;
  avg_position: number | null;
  synced_at: string;
};

/** Maps raw GSC page rows to catalog hub slugs (exported for tests). */
export function mapGscPageRowsToLocationMetrics(
  apiRows: Awaited<ReturnType<typeof fetchGscPagePerformance>>,
): { metrics: LocationGscMetricRow[]; skippedUrls: string[] } {
  const validSlugs = new Set<string>(getAllProgrammaticLocationSlugs());
  const bySlug = new Map<string, LocationGscMetricRow>();
  const skippedUrls: string[] = [];
  const syncedAt = new Date().toISOString();

  for (const row of apiRows) {
    const slug = hubSlugFromGscPageUrl(row.pageUrl);
    if (!slug || !validSlugs.has(slug)) {
      if (row.pageUrl.includes("/locations/")) skippedUrls.push(row.pageUrl);
      continue;
    }

    const existing = bySlug.get(slug);
    if (existing) {
      existing.clicks += row.clicks;
      existing.impressions += row.impressions;
      existing.ctr =
        existing.impressions > 0 ? Math.round((existing.clicks / existing.impressions) * 1_000_000) / 1_000_000 : 0;
      if (row.avgPosition != null && existing.avg_position != null) {
        existing.avg_position = Math.round(((existing.avg_position + row.avgPosition) / 2) * 10) / 10;
      } else if (row.avgPosition != null) {
        existing.avg_position = row.avgPosition;
      }
      continue;
    }

    bySlug.set(slug, {
      slug,
      page_url: row.pageUrl,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      avg_position: row.avgPosition,
      synced_at: syncedAt,
    });
  }

  return { metrics: [...bySlug.values()], skippedUrls: skippedUrls.slice(0, 50) };
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
      skippedUrls: [],
      startDate: "",
      endDate: "",
      siteUrl: null,
      error: "Missing GSC_CLIENT_EMAIL, GSC_PRIVATE_KEY, or GSC_SITE_URL.",
    };
  }

  const range: GscDateRange = buildGscDateRange(readGscSyncDays());

  try {
    const apiRows = await fetchGscPagePerformance(credentials, range);
    const { metrics, skippedUrls } = mapGscPageRowsToLocationMetrics(apiRows);
    const upsert = await upsertLocationGscMetrics(admin, metrics);

    if (upsert.error) {
      console.error("[gsc-sync] upsert failed:", upsert.error);
      return {
        ok: false,
        rowsFetched: apiRows.length,
        locationRowsMatched: metrics.length,
        rowsSaved: 0,
        skippedUrls,
        startDate: range.startDate,
        endDate: range.endDate,
        siteUrl: credentials.siteUrl,
        error: upsert.error,
      };
    }

    console.info(
      `[gsc-sync] saved ${upsert.rowsSaved} location rows (${range.startDate}..${range.endDate}) for ${credentials.siteUrl}`,
    );

    return {
      ok: true,
      rowsFetched: apiRows.length,
      locationRowsMatched: metrics.length,
      rowsSaved: upsert.rowsSaved,
      skippedUrls,
      startDate: range.startDate,
      endDate: range.endDate,
      siteUrl: credentials.siteUrl,
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
      skippedUrls: [],
      startDate: range.startDate,
      endDate: range.endDate,
      siteUrl: credentials.siteUrl,
      error: message,
    };
  }
}
