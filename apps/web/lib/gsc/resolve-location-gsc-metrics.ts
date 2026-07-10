import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { listLocationGscMetricEntries } from "@/lib/seo/location-seo-feedback";
import type { LocationGscMetricSnapshot } from "@/lib/seo/location-seo-feedback.types";

export type GscMetricsSource = "database" | "env" | "file" | "none";

export type ResolvedLocationGscMetrics = {
  entries: Array<{ slug: string; metrics: LocationGscMetricSnapshot }>;
  source: GscMetricsSource;
  syncedAt: string | null;
};

type DbGscRow = {
  slug: string;
  page_url: string;
  clicks: number;
  impressions: number;
  ctr: number | string;
  avg_position: number | string | null;
  prev_clicks?: number;
  prev_impressions?: number;
  prev_avg_position?: number | string | null;
  synced_at: string;
};

function toNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function dbRowToGscSnapshot(row: DbGscRow): LocationGscMetricSnapshot {
  return {
    impressions: toNumber(row.impressions) ?? undefined,
    clicks: toNumber(row.clicks) ?? undefined,
    ctr: toNumber(row.ctr) ?? undefined,
    avg_position: toNumber(row.avg_position) ?? undefined,
    prev_clicks: toNumber(row.prev_clicks) ?? undefined,
    prev_impressions: toNumber(row.prev_impressions) ?? undefined,
    prev_avg_position: toNumber(row.prev_avg_position) ?? undefined,
  };
}

async function loadLocationGscMetricsFromDb(
  admin: SupabaseClient,
): Promise<{ rows: DbGscRow[]; latestSyncedAt: string | null } | null> {
  const { data, error } = await admin
    .from("location_gsc_metrics")
    .select("slug, page_url, clicks, impressions, ctr, avg_position, prev_clicks, prev_impressions, prev_avg_position, synced_at")
    .order("impressions", { ascending: false });

  if (error) {
    if (error.code === "42P01" || error.message.includes("does not exist")) {
      return null;
    }
    console.error("[gsc-metrics] database read failed:", error.message);
    return null;
  }

  const rows = (data ?? []) as DbGscRow[];
  const latestSyncedAt =
    rows.length > 0
      ? rows.reduce((latest, row) => (row.synced_at > latest ? row.synced_at : latest), rows[0]!.synced_at)
      : null;

  return { rows, latestSyncedAt };
}

function fallbackSourceFromEnv(): GscMetricsSource {
  if (process.env.LOCATION_SEO_FEEDBACK_JSON?.trim()) {
    return process.env.LOCATION_SEO_FEEDBACK_JSON_FILE?.trim() ? "file" : "env";
  }
  if (process.env.LOCATION_SEO_FEEDBACK_JSON_FILE?.trim()) return "file";
  return "none";
}

/**
 * Per-slug merge: env/file base layer, then DB sync overlays matching slugs (DB wins).
 * Used by the SEO health engine and admin GSC snapshot.
 */
export async function buildMergedGscMetricsMap(
  admin: SupabaseClient | null,
): Promise<Map<string, LocationGscMetricSnapshot>> {
  const map = new Map<string, LocationGscMetricSnapshot>(
    listLocationGscMetricEntries().map(({ slug, metrics }) => [slug, metrics]),
  );

  if (admin) {
    const db = await loadLocationGscMetricsFromDb(admin);
    if (db) {
      for (const row of db.rows) {
        map.set(row.slug, dbRowToGscSnapshot(row));
      }
    }
  }

  return map;
}

/**
 * Priority: merged DB + env/file per slug (DB overrides env for the same slug).
 */
export async function resolveLocationGscMetricEntries(
  admin: SupabaseClient | null,
): Promise<ResolvedLocationGscMetrics> {
  const merged = await buildMergedGscMetricsMap(admin);
  if (merged.size === 0) {
    return { source: "none", syncedAt: null, entries: [] };
  }

  let source: GscMetricsSource = fallbackSourceFromEnv();
  let syncedAt: string | null = null;

  if (admin) {
    const db = await loadLocationGscMetricsFromDb(admin);
    if (db && db.rows.length > 0) {
      source = "database";
      syncedAt = db.latestSyncedAt;
    }
  }

  const entries = [...merged.entries()]
    .map(([slug, metrics]) => ({ slug, metrics }))
    .sort((a, b) => (b.metrics.impressions ?? 0) - (a.metrics.impressions ?? 0));

  return { source, syncedAt, entries };
}

export function toGscImportSnapshot(
  entries: Array<{ slug: string; metrics: LocationGscMetricSnapshot }>,
) {
  return entries
    .map(({ slug, metrics }) => ({
      slug,
      impressions: metrics.impressions ?? null,
      clicks: metrics.clicks ?? null,
      ctr: metrics.ctr ?? null,
      avg_position: metrics.avg_position ?? null,
      prev_clicks: metrics.prev_clicks ?? null,
      prev_impressions: metrics.prev_impressions ?? null,
      prev_avg_position: metrics.prev_avg_position ?? null,
      ctr_pct_display: metrics.ctr != null ? Math.round(metrics.ctr * 10_000) / 100 : null,
    }))
    .sort((a, b) => (b.clicks ?? 0) - (a.clicks ?? 0));
}
