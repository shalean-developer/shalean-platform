import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Phase 4: list recent catalog audit rows for rollback UI. */
export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const url = new URL(request.url);
  const table = url.searchParams.get("table")?.trim() ?? "";
  const limitRaw = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, Math.round(limitRaw))) : 50;

  let q = admin
    .from("pricing_catalog_audit")
    .select("id, table_name, row_id, action, actor_email, created_at, rollback_of")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (
    table === "pricing_services" ||
    table === "pricing_extras" ||
    table === "pricing_booking_config"
  ) {
    q = q.eq("table_name", table);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, rows: data ?? [] });
}
