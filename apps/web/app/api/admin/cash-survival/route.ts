import { NextResponse } from "next/server";
import { requireAdminPermissionFromRequest } from "@/lib/admin/requirePermission";
import { loadCashSurvivalDashboard } from "@/lib/admin/expenses/loadCashSurvivalDashboard";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminPermissionFromRequest(request, "payout.view");
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  try {
    const payload = await loadCashSurvivalDashboard(admin, from, to);
    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load cash survival dashboard.";
    console.error("[admin/cash-survival]", message, e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
