import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { humanizeLocationSlug } from "@/lib/seo/humanize-location-slug";

export type GscQuerySnapshotRow = {
  query: string;
  slug: string;
  landing_page: string;
  clicks: number;
  impressions: number;
  ctr: number | null;
  avg_position: number | null;
  prev_clicks: number;
  prev_impressions: number;
  prev_avg_position: number | null;
  ctr_pct_display: number | null;
};

type DbGscQueryRow = {
  query: string;
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

export async function loadLocationGscQuerySnapshot(
  admin: SupabaseClient,
  limit = 500,
): Promise<{ rows: GscQuerySnapshotRow[]; syncedAt: string | null } | null> {
  const { data, error } = await admin
    .from("location_gsc_queries")
    .select(
      "query, slug, page_url, clicks, impressions, ctr, avg_position, prev_clicks, prev_impressions, prev_avg_position, synced_at",
    )
    .order("clicks", { ascending: false })
    .limit(limit);

  if (error) {
    if (error.code === "42P01" || error.message.includes("does not exist")) {
      return null;
    }
    console.error("[gsc-queries] database read failed:", error.message);
    return null;
  }

  const dbRows = (data ?? []) as DbGscQueryRow[];
  const latestSyncedAt =
    dbRows.length > 0
      ? dbRows.reduce((latest, row) => (row.synced_at > latest ? row.synced_at : latest), dbRows[0]!.synced_at)
      : null;

  return {
    syncedAt: latestSyncedAt,
    rows: dbRows.map((row) => {
      const ctr = toNumber(row.ctr);
      return {
        query: row.query,
        slug: row.slug,
        landing_page: humanizeLocationSlug(row.slug),
        clicks: toNumber(row.clicks) ?? 0,
        impressions: toNumber(row.impressions) ?? 0,
        ctr,
        avg_position: toNumber(row.avg_position),
        prev_clicks: toNumber(row.prev_clicks) ?? 0,
        prev_impressions: toNumber(row.prev_impressions) ?? 0,
        prev_avg_position: toNumber(row.prev_avg_position),
        ctr_pct_display: ctr != null ? Math.round(ctr * 10_000) / 100 : null,
      };
    }),
  };
}
