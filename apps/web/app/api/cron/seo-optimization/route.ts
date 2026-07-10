import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron/verifyCronSecret";
import { buildMergedGscMetricsMap } from "@/lib/gsc/resolve-location-gsc-metrics";
import { aggregateSeoUserEvents, fetchSeoInsightUserEvents } from "@/lib/seo/optimization/aggregate-seo-events";
import { runSeoOptimizationEngine } from "@/lib/seo/optimization/engine";
import { persistSeoOptimizationResults } from "@/lib/seo/optimization/persist";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;

function envBool(name: string, defaultValue: boolean): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  if (!v) return defaultValue;
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Weekly/daily: merge `user_events` SEO instrumentation + GSC JSON signals, write recommendations,
 * and optionally apply safe title-variant / hub UI patches (never copy or pricing).
 *
 * Auth: `Authorization: Bearer CRON_SECRET` or `x-cron-secret: CRON_SECRET`.
 */
export async function POST(request: Request) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase admin not configured." }, { status: 503 });
  }

  const [{ sinceIso, rows, error }, gscMetricsBySlug] = await Promise.all([
    fetchSeoInsightUserEvents(admin, WINDOW_DAYS),
    buildMergedGscMetricsMap(admin),
  ]);
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  const aggregated = aggregateSeoUserEvents(rows);
  const engineResult = runSeoOptimizationEngine(aggregated, { gscMetricsBySlug });

  const applyTitleVariants = envBool("SEO_OPTIMIZATION_AUTO_APPLY_TITLE", false);
  const applyHubUiPatches = envBool("SEO_OPTIMIZATION_AUTO_APPLY_HUB_UI", false);

  const persisted = await persistSeoOptimizationResults(admin, engineResult, {
    applyTitleVariants,
    applyHubUiPatches,
  });

  return NextResponse.json({
    ok: true,
    since: sinceIso,
    rows_loaded: rows.length,
    apply_title_variants: applyTitleVariants,
    apply_hub_ui_patches: applyHubUiPatches,
    ...persisted,
    title_candidates: engineResult.titleAutoCandidates.length,
    hub_ui_candidates: engineResult.hubUiPatches.length,
    page_health_rows: engineResult.pageHealth.length,
  });
}
