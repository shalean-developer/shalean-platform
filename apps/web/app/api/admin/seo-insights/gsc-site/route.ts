import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { loadSiteGscPageGroups } from "@/lib/gsc/sync-site-gsc-metrics";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const snapshot = await loadSiteGscPageGroups(admin);
  if (snapshot.error && snapshot.rows.length === 0) {
    const missingTable = snapshot.error.includes("site_gsc_metrics") || snapshot.error.includes("does not exist");
    return NextResponse.json(
      { error: snapshot.error, groups: [], rows: [], synced_at: null },
      { status: missingTable ? 503 : 500 },
    );
  }

  return NextResponse.json({
    groups: snapshot.groups,
    rows: snapshot.rows,
    page_count: snapshot.rows.length,
    synced_at: snapshot.syncedAt,
  });
}
