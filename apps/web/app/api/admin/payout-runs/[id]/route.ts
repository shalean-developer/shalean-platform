import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing run id." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: run, error: runErr } = await admin
    .from("cleaner_payout_runs")
    .select("id, status, total_amount_cents, created_at, approved_at, paid_at")
    .eq("id", id)
    .maybeSingle();

  if (runErr) return NextResponse.json({ error: runErr.message }, { status: 500 });
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });

  const { data: payouts, error: pErr } = await admin
    .from("cleaner_payouts")
    .select("id, cleaner_id, total_amount_cents, status, period_start, period_end, frozen_at, created_at")
    .eq("payout_run_id", id)
    .order("total_amount_cents", { ascending: false });

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const payoutRows = payouts ?? [];
  const cleanerIds = [...new Set(payoutRows.map((p) => String((p as { cleaner_id?: string }).cleaner_id ?? "")).filter(Boolean))];
  const names = new Map<string, string>();
  if (cleanerIds.length) {
    const { data: cleaners } = await admin.from("cleaners").select("id, full_name").in("id", cleanerIds);
    for (const c of cleaners ?? []) {
      const row = c as { id?: string; full_name?: string | null };
      if (row.id) names.set(row.id, row.full_name?.trim() || row.id);
    }
  }

  return NextResponse.json({
    run,
    payouts: payoutRows.map((p) => {
      const row = p as { id: string; cleaner_id: string; total_amount_cents: number; status: string; period_start: string; period_end: string; frozen_at?: string | null; created_at: string };
      return {
        ...row,
        cleaner_name: names.get(row.cleaner_id) ?? row.cleaner_id,
      };
    }),
  });
}
