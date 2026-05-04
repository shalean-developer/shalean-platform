import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { listLocationGscMetricEntries } from "@/lib/seo/location-seo-feedback";
import {
  aggregateSeoUserEvents,
  fetchSeoInsightUserEvents,
  type ScrollFunnelRow,
} from "@/lib/seo/optimization/aggregate-seo-events";
import { runSeoOptimizationEngine } from "@/lib/seo/optimization/engine";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return NextResponse.json({ error: "Missing authorization." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const pub = createClient(url, anon);
  const {
    data: { user },
    error: userErr,
  } = await pub.auth.getUser(token);
  if (userErr || !user?.email) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }
  if (!isAdmin(user.email)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { sinceIso, rows, error } = await fetchSeoInsightUserEvents(admin, WINDOW_DAYS);
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  const aggregated = aggregateSeoUserEvents(rows);
  const optimization = runSeoOptimizationEngine(aggregated);

  const variantMap = new Map<string, { variant: string; confidence: number; updated_at: string | null }>();
  const hubPatchMap = new Map<string, { swap_hero_book_ctas: boolean; confidence: number; updated_at: string | null }>();

  const [variantsRes, patchesRes, recRes] = await Promise.all([
    admin.from("seo_auto_title_variant").select("slug, variant, confidence, updated_at"),
    admin.from("seo_auto_hub_ui_patch").select("slug, swap_hero_book_ctas, confidence, updated_at"),
    admin
      .from("seo_insights_recommendations")
      .select("id, slug, kind, severity, title, detail, confidence, applied_at, created_at")
      .order("created_at", { ascending: false })
      .limit(150),
  ]);

  if (!variantsRes.error && variantsRes.data) {
    for (const r of variantsRes.data as { slug: string; variant: string; confidence: number; updated_at: string }[]) {
      variantMap.set(r.slug, { variant: r.variant, confidence: r.confidence, updated_at: r.updated_at });
    }
  }
  if (!patchesRes.error && patchesRes.data) {
    for (const r of patchesRes.data as {
      slug: string;
      swap_hero_book_ctas: boolean;
      confidence: number;
      updated_at: string;
    }[]) {
      hubPatchMap.set(r.slug, {
        swap_hero_book_ctas: r.swap_hero_book_ctas,
        confidence: r.confidence,
        updated_at: r.updated_at,
      });
    }
  }

  const scroll_depth_by_slug: ScrollFunnelRow[] = aggregated.scrollFunnels.slice(0, 40);

  const page_health_table = optimization.pageHealth.slice(0, 80).map((row) => ({
    slug: row.slug,
    health_score: row.score,
    health_band: row.band,
    winning_title_variant_db: variantMap.get(row.slug)?.variant ?? null,
    suggested_title_variant_gsc: row.winning_title_variant,
    best_cta_key: row.best_cta_key,
    hero_swap_applied: hubPatchMap.get(row.slug)?.swap_hero_book_ctas ?? false,
  }));

  const gscImported = listLocationGscMetricEntries()
    .map(({ slug, metrics }) => ({
      slug,
      impressions: metrics.impressions ?? null,
      clicks: metrics.clicks ?? null,
      ctr: metrics.ctr ?? null,
      avg_position: metrics.avg_position ?? null,
      ctr_pct_display: metrics.ctr != null ? Math.round(metrics.ctr * 10_000) / 100 : null,
    }))
    .sort((a, b) => (b.ctr ?? 0) - (a.ctr ?? 0));

  return NextResponse.json({
    since: sinceIso,
    rows_loaded: rows.length,
    top_suburbs_by_cta_clicks: aggregated.topSuburbsByCtaClicks,
    top_cta_compound: aggregated.topCtaCompound,
    cta_kind_booking_proxy: aggregated.ctaKindLocationBooking.map((r) => ({
      cta_kind: r.cta_kind,
      cta_location: r.cta_location,
      key: r.key,
      distinct_sessions: r.distinct_sessions,
      sessions_with_booking_start: r.sessions_with_booking_start,
      conversion_pct: r.conversion_pct,
    })),
    scroll_depth_by_slug,
    gsc_import_snapshot: gscImported.slice(0, 40),
    optimization: {
      page_health_table,
      recommendations: recRes.error ? [] : recRes.data ?? [],
    },
    notes: [
      "Suburbs and scroll metrics require migration `20260887_seo_location_analytics_events.sql` and hub instrumentation.",
      "GSC rows come from `LOCATION_SEO_FEEDBACK_JSON.gscMetrics` (manual import). CTR on snapshot is `ctr` as a 0–1 fraction.",
      "Booking proxy: share of distinct sessions with a given `cta_kind`+`cta_location` that also fired `start_booking` within the window.",
      "Automation: POST `/api/cron/seo-optimization` (CRON_SECRET). Env: `SEO_OPTIMIZATION_AUTO_APPLY_TITLE`, `SEO_OPTIMIZATION_AUTO_APPLY_HUB_UI`.",
    ],
  });
}
