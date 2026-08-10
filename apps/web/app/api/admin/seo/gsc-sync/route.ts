import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { runLocationGscSync } from "@/lib/gsc/sync-location-gsc-metrics";
import { runSiteGscSync } from "@/lib/gsc/sync-site-gsc-metrics";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin-triggered Search Console sync for whole-site and location metrics. */
export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const [location, site] = await Promise.all([
    runLocationGscSync(admin),
    runSiteGscSync(admin),
  ]);
  const ok = location.ok && site.ok;
  const missingConfig = location.error?.includes("Missing GSC_") || site.error?.includes("Missing GSC_");
  return NextResponse.json({ ok, location, site }, { status: ok ? 200 : missingConfig ? 503 : 502 });
}
