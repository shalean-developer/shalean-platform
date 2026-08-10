import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron/verifyCronSecret";
import { runLocationGscSync } from "@/lib/gsc/sync-location-gsc-metrics";
import { runSiteGscSync } from "@/lib/gsc/sync-site-gsc-metrics";
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

  const [location, site] = await Promise.all([
    runLocationGscSync(admin),
    runSiteGscSync(admin),
  ]);
  const ok = location.ok && site.ok;
  return NextResponse.json({ ok, location, site }, { status: ok ? 200 : 502 });
}

/** Scheduled pg_cron GET or authenticated manual POST with CRON_SECRET. */
export async function GET(request: Request) {
  return handleCron(request);
}

export async function POST(request: Request) {
  return handleCron(request);
}
