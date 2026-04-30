import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { retryFailedRunTransfers } from "@/lib/payout/runs/retryFailedRunTransfers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing run id." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let payoutId: string | undefined;
  try {
    const body = (await request.json().catch(() => ({}))) as { payoutId?: string };
    if (typeof body.payoutId === "string" && body.payoutId.trim()) payoutId = body.payoutId.trim();
  } catch {
    payoutId = undefined;
  }

  try {
    const result = await retryFailedRunTransfers(admin, { runId: id, paidBy: auth.userId, payoutId: payoutId ?? null });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
