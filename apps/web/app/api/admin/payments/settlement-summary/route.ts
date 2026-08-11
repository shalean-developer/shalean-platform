import { NextResponse } from "next/server";
import { requireAdminPermissionFromRequest } from "@/lib/admin/requirePermission";
import { loadSettlementCashSummary } from "@/lib/payments/loadSettlementCashSummary";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const auth = await requireAdminPermissionFromRequest(request, "payout.view");
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const url = new URL(request.url);
  const now = new Date();
  const defaultTo = now.toISOString().slice(0, 10);
  const defaultFrom = new Date(now.getTime() - 31 * 86_400_000).toISOString().slice(0, 10);
  const from = url.searchParams.get("from")?.trim() || defaultFrom;
  const to = url.searchParams.get("to")?.trim() || defaultTo;
  if (!YMD_RE.test(from) || !YMD_RE.test(to) || from > to) {
    return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
  }

  try {
    const summary = await loadSettlementCashSummary(admin, { from, to, now });
    return NextResponse.json(summary);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load settlement summary.";
    console.error("[admin/payments/settlement-summary]", message, e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
