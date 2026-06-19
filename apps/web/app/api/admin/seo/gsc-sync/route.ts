import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { runLocationGscSync } from "@/lib/gsc/sync-location-gsc-metrics";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin-triggered Search Console sync for location hub metrics. */
export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const summary = await runLocationGscSync(admin);
  const status = summary.ok ? 200 : summary.error?.includes("Missing GSC_") ? 503 : 502;
  return NextResponse.json(summary, { status });
}
