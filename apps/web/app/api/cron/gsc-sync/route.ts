import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron/verifyCronSecret";
import { runLocationGscSync } from "@/lib/gsc/sync-location-gsc-metrics";
import { runSiteGscSync } from "@/lib/gsc/sync-site-gsc-metrics";
import { logCronRun } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleCron(request: Request) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase admin not configured." }, { status: 503 });
  }

  try {
    const [location, site] = await Promise.all([
      runLocationGscSync(admin),
      runSiteGscSync(admin),
    ]);
    const ok = location.ok && site.ok;

    await logCronRun({
      jobName: "gsc-sync",
      status: ok ? "success" : "error",
      message: ok ? "Search Console sync completed." : "Search Console sync completed with errors.",
      context: {
        location_rows_fetched: location.rowsFetched,
        location_rows_matched: location.locationRowsMatched,
        location_rows_saved: location.rowsSaved,
        query_rows_fetched: location.queryRowsFetched,
        query_rows_matched: location.queryRowsMatched,
        query_rows_saved: location.queryRowsSaved,
        site_rows_fetched: site.rowsFetched,
        site_rows_matched: site.rowsMatched,
        site_rows_saved: site.rowsSaved,
        start_date: site.startDate || location.startDate,
        end_date: site.endDate || location.endDate,
        location_error: location.error ?? null,
        query_error: location.queryError ?? null,
        site_error: site.error ?? null,
      },
    });

    return NextResponse.json({ ok, location, site }, { status: ok ? 200 : 502 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown GSC sync failure.";
    await logCronRun({
      jobName: "gsc-sync",
      status: "error",
      message,
      context: { error: message },
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** Scheduled pg_cron GET or authenticated manual POST with CRON_SECRET. */
export async function GET(request: Request) {
  return handleCron(request);
}

export async function POST(request: Request) {
  return handleCron(request);
}
