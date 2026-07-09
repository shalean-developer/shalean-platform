import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GscDateRange, GscQueryPagePerformanceRow } from "@/lib/gsc/gsc-config";
import { fetchGscQueryPagePerformance } from "@/lib/gsc/search-console";
import { hubSlugFromGscPageUrl } from "@/lib/seo/gsc-page-import";
import { getAllProgrammaticLocationSlugs } from "@/lib/seo/locations";

export const MAX_STORED_GSC_QUERY_ROWS = 2_000;

export type LocationGscQueryRow = {
  query: string;
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

type AggregatedQueryRow = {
  query: string;
  slug: string;
  page_url: string;
  clicks: number;
  impressions: number;
  ctr: number;
  avg_position: number | null;
};

function aggregateQueryPageRows(apiRows: GscQueryPagePerformanceRow[]): Map<string, AggregatedQueryRow> {
  const validSlugs = new Set<string>(getAllProgrammaticLocationSlugs());
  const byKey = new Map<string, AggregatedQueryRow>();

  for (const row of apiRows) {
    const slug = hubSlugFromGscPageUrl(row.pageUrl);
    if (!slug || !validSlugs.has(slug)) continue;

    const query = row.query.trim();
    if (!query) continue;

    const key = `${query}\u0000${slug}`;
    const existing = byKey.get(key);
    if (existing) {
      const totalImpressions = existing.impressions + row.impressions;
      const totalClicks = existing.clicks + row.clicks;
      existing.clicks = totalClicks;
      existing.impressions = totalImpressions;
      existing.ctr =
        totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 1_000_000) / 1_000_000 : 0;
      if (row.avgPosition != null) {
        const weight = row.impressions > 0 ? row.impressions : 1;
        const prevWeight = existing.impressions - row.impressions > 0 ? existing.impressions - row.impressions : 0;
        if (existing.avg_position != null && prevWeight > 0) {
          existing.avg_position =
            Math.round(
              ((existing.avg_position * prevWeight + row.avgPosition * weight) / (prevWeight + weight)) * 10,
            ) / 10;
        } else {
          existing.avg_position = row.avgPosition;
        }
      }
      continue;
    }

    byKey.set(key, {
      query,
      slug,
      page_url: row.pageUrl,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      avg_position: row.avgPosition,
    });
  }

  return byKey;
}

/** Maps raw GSC query+page rows to catalog hub slugs (exported for tests). */
export function mapGscQueryPageRowsToLocationQueries(
  apiRows: GscQueryPagePerformanceRow[],
  prevApiRows: GscQueryPagePerformanceRow[] = [],
  maxRows = MAX_STORED_GSC_QUERY_ROWS,
): { metrics: LocationGscQueryRow[]; skippedUrls: string[] } {
  const validSlugs = new Set<string>(getAllProgrammaticLocationSlugs());
  const skippedUrls: string[] = [];
  const syncedAt = new Date().toISOString();
  const currentByKey = aggregateQueryPageRows(apiRows);
  const prevByKey = aggregateQueryPageRows(prevApiRows);

  for (const row of apiRows) {
    const slug = hubSlugFromGscPageUrl(row.pageUrl);
    if ((!slug || !validSlugs.has(slug)) && row.pageUrl.includes("/locations/")) {
      skippedUrls.push(row.pageUrl);
    }
  }

  const metrics = [...currentByKey.entries()]
    .map(([key, current]) => {
      const prev = prevByKey.get(key);
      return {
        query: current.query,
        slug: current.slug,
        page_url: current.page_url,
        clicks: current.clicks,
        impressions: current.impressions,
        ctr: current.ctr,
        avg_position: current.avg_position,
        prev_clicks: prev?.clicks ?? 0,
        prev_impressions: prev?.impressions ?? 0,
        prev_avg_position: prev?.avg_position ?? null,
        synced_at: syncedAt,
      };
    })
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, maxRows);

  return { metrics, skippedUrls: [...new Set(skippedUrls)].slice(0, 50) };
}

export async function replaceLocationGscQueries(
  admin: SupabaseClient,
  metrics: LocationGscQueryRow[],
): Promise<{ rowsSaved: number; error?: string }> {
  const { error: deleteError } = await admin.from("location_gsc_queries").delete().gte("impressions", 0);
  if (deleteError) {
    if (deleteError.code === "42P01" || deleteError.message.includes("does not exist")) {
      return {
        rowsSaved: 0,
        error: "location_gsc_queries table missing — run migration 20261052_location_gsc_queries.sql",
      };
    }
    return { rowsSaved: 0, error: deleteError.message };
  }

  if (metrics.length === 0) return { rowsSaved: 0 };

  const { error } = await admin.from("location_gsc_queries").insert(metrics);
  if (error) {
    return { rowsSaved: 0, error: error.message };
  }

  return { rowsSaved: metrics.length };
}

export async function syncLocationGscQueries(
  admin: SupabaseClient,
  credentials: Parameters<typeof fetchGscQueryPagePerformance>[0],
  range: GscDateRange,
  previousRange: GscDateRange,
): Promise<{
  ok: boolean;
  rowsFetched: number;
  rowsMatched: number;
  rowsSaved: number;
  skippedUrls: string[];
  error?: string;
}> {
  try {
    const [apiRows, prevApiRows] = await Promise.all([
      fetchGscQueryPagePerformance(credentials, range),
      fetchGscQueryPagePerformance(credentials, previousRange),
    ]);
    const { metrics, skippedUrls } = mapGscQueryPageRowsToLocationQueries(apiRows, prevApiRows);
    const replace = await replaceLocationGscQueries(admin, metrics);

    if (replace.error) {
      return {
        ok: false,
        rowsFetched: apiRows.length,
        rowsMatched: metrics.length,
        rowsSaved: 0,
        skippedUrls,
        error: replace.error,
      };
    }

    return {
      ok: true,
      rowsFetched: apiRows.length,
      rowsMatched: metrics.length,
      rowsSaved: replace.rowsSaved,
      skippedUrls,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "GSC query sync failed.";
    return {
      ok: false,
      rowsFetched: 0,
      rowsMatched: 0,
      rowsSaved: 0,
      skippedUrls: [],
      error: message,
    };
  }
}
