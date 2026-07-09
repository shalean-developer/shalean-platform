import { NextResponse } from "next/server";
import { requireFinanceApi } from "@/lib/auth/requireFinanceApi";
import { loadFinancialDashboard } from "@/lib/admin/expenses/loadFinancialDashboard";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireFinanceApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const branchId = url.searchParams.get("branch_id") ?? undefined;

  try {
    const dashboard = await loadFinancialDashboard(admin, from, to, branchId);
    return NextResponse.json(dashboard);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load financial dashboard.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
