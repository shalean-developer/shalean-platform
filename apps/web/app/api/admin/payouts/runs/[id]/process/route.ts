import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { processPayoutRun } from "@/lib/payout/runs/processPayoutRun";
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

  let mode: "paystack" | "manual" | undefined;
  try {
    const body = (await request.json().catch(() => ({}))) as { mode?: string };
    if (body.mode === "manual" || body.mode === "paystack") mode = body.mode;
  } catch {
    mode = undefined;
  }

  try {
    const result = await processPayoutRun(admin, id, { paidBy: auth.userId, mode });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
