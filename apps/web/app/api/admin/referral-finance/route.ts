import { NextResponse } from "next/server";
import { requireFinanceApi } from "@/lib/auth/requireFinanceApi";
import { loadReferralFinanceDashboard } from "@/lib/admin/referrals/loadReferralFinanceDashboard";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireFinanceApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const url = new URL(request.url);
  const payload = await loadReferralFinanceDashboard(
    admin,
    url.searchParams.get("from"),
    url.searchParams.get("to"),
  );
  return NextResponse.json(payload);
}
