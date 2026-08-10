import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEO_JOBS = ["gsc-sync", "seo-optimization", "sitemap-health"] as const;
type SeoJob = (typeof SEO_JOBS)[number];

type CronLogRow = {
  id: string;
  level: string;
  message: string;
  context: Record<string, unknown> | null;
  created_at: string;
};

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizeRun(row: CronLogRow) {
  const context = row.context ?? {};
  const job = SEO_JOBS.includes(row.message as SeoJob) ? (row.message as SeoJob) : null;
  if (!job) return null;

  const status = context.status === "error" || row.level === "error" ? "error" : "success";
  const detail = asString(context.detail);

  if (job === "gsc-sync") {
    const locationSaved = asNumber(context.location_rows_saved) ?? 0;
    const querySaved = asNumber(context.query_rows_saved) ?? 0;
    const siteSaved = asNumber(context.site_rows_saved) ?? 0;
    return {
      id: row.id,
      job,
      status,
      created_at: row.created_at,
      detail,
      metrics: {
        rows_processed: locationSaved + querySaved + siteSaved,
        location_rows_saved: locationSaved,
        query_rows_saved: querySaved,
        site_rows_saved: siteSaved,
        location_rows_fetched: asNumber(context.location_rows_fetched),
        query_rows_fetched: asNumber(context.query_rows_fetched),
        site_rows_fetched: asNumber(context.site_rows_fetched),
      },
      errors: [context.location_error, context.query_error, context.site_error, context.error]
        .map(asString)
        .filter((value): value is string => Boolean(value)),
    };
  }

  if (job === "sitemap-health") {
    return {
      id: row.id,
      job,
      status,
      created_at: row.created_at,
      detail,
      metrics: {
        http_status: asNumber(context.http_status),
        url_count: asNumber(context.url_count),
      },
      errors: [context.error].map(asString).filter((value): value is string => Boolean(value)),
    };
  }

  const recommendations = asNumber(context.recommendationsInserted) ?? 0;
  const titleApplied = asNumber(context.titleVariantsUpserted) ?? 0;
  const hubApplied = asNumber(context.hubPatchesUpserted) ?? 0;
  return {
    id: row.id,
    job,
    status,
    created_at: row.created_at,
    detail,
    metrics: {
      rows_processed: asNumber(context.rows_loaded) ?? 0,
      recommendations_created: recommendations,
      changes_applied: titleApplied + hubApplied,
      title_variants_applied: titleApplied,
      hub_ui_patches_applied: hubApplied,
      title_candidates: asNumber(context.title_candidates),
      hub_ui_candidates: asNumber(context.hub_ui_candidates),
      page_health_rows: asNumber(context.page_health_rows),
    },
    errors: [context.error].map(asString).filter((value): value is string => Boolean(value)),
  };
}

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data, error } = await admin
    .from("system_logs")
    .select("id,level,message,context,created_at")
    .eq("source", "cron_run")
    .in("message", [...SEO_JOBS])
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const runs = ((data ?? []) as CronLogRow[]).map(normalizeRun).filter(Boolean);
  const latestByJob = Object.fromEntries(
    SEO_JOBS.map((job) => [job, runs.find((run) => run?.job === job) ?? null]),
  );

  return NextResponse.json({
    jobs: SEO_JOBS,
    latest_by_job: latestByJob,
    runs,
    run_count: runs.length,
  });
}
