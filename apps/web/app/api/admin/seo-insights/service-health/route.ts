import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { SEO_REBUILD_SITEMAP_CORE_PATHS } from "@/lib/seo/seoRebuildPhase1";
import { SITE_ORIGIN } from "@/lib/site/canonical";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Metric = {
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

const SERVICE_PATHS = (SEO_REBUILD_SITEMAP_CORE_PATHS as readonly string[])
  .filter((path) => path === "/services" || path.startsWith("/services/"));

function normalizedPath(url: string): string | null {
  try { return new URL(url).pathname.replace(/\/+$/, "") || "/"; } catch { return null; }
}

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data, error } = await admin
    .from("site_gsc_metrics")
    .select("page_url,clicks,impressions,ctr,avg_position,prev_clicks,prev_impressions,prev_avg_position,synced_at")
    .eq("page_group", "service")
    .order("impressions", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byPath = new Map<string, Metric>();
  for (const row of (data ?? []) as Metric[]) {
    const path = normalizedPath(row.page_url);
    if (path) byPath.set(path, row);
  }

  const rows = SERVICE_PATHS.map((path) => {
    const metric = byPath.get(path) ?? null;
    const issues: Array<{ code: string; severity: "high" | "medium" | "low"; message: string }> = [];
    if (!metric) issues.push({ code: "no_gsc_data", severity: "medium", message: "No current GSC page metrics yet; confirm indexing and query visibility." });
    if (metric && metric.prev_impressions >= 20 && metric.impressions < metric.prev_impressions * 0.7) issues.push({ code: "declining_impressions", severity: "high", message: `Impressions declined from ${metric.prev_impressions} to ${metric.impressions}.` });
    if (metric && metric.prev_clicks >= 5 && metric.clicks < metric.prev_clicks * 0.7) issues.push({ code: "declining_clicks", severity: "high", message: `Clicks declined from ${metric.prev_clicks} to ${metric.clicks}.` });
    if (metric?.avg_position != null && metric.prev_avg_position != null && metric.avg_position - metric.prev_avg_position >= 3) issues.push({ code: "ranking_decline", severity: "medium", message: `Average position declined by ${(metric.avg_position - metric.prev_avg_position).toFixed(1)} places.` });
    if (metric && metric.impressions >= 50 && metric.ctr < 0.02) issues.push({ code: "low_ctr", severity: "medium", message: `CTR is ${(metric.ctr * 100).toFixed(1)}%; review title and description against visible queries.` });
    const health = issues.some((issue) => issue.severity === "high") ? "critical" : issues.length ? "warning" : "healthy";
    return { path, url: `${SITE_ORIGIN}${path}`, metric, issues, health };
  });

  const rank: Record<string, number> = { critical: 0, warning: 1, healthy: 2 };
  rows.sort((a, b) => rank[a.health] - rank[b.health] || (b.metric?.impressions ?? 0) - (a.metric?.impressions ?? 0));

  return NextResponse.json({
    summary: {
      servicePages: rows.length,
      tracked: rows.filter((row) => row.metric).length,
      critical: rows.filter((row) => row.health === "critical").length,
      warning: rows.filter((row) => row.health === "warning").length,
      healthy: rows.filter((row) => row.health === "healthy").length,
    },
    rows,
  });
}
