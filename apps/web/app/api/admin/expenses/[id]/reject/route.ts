import { NextResponse } from "next/server";
import { requireFinanceApi } from "@/lib/auth/requireFinanceApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: RouteCtx) {
  const auth = await requireFinanceApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let body: { rejection_reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const reason = String(body.rejection_reason ?? "").trim();
  if (!reason) {
    return NextResponse.json({ error: "rejection_reason is required." }, { status: 400 });
  }

  const { id } = await ctx.params;
  const now = new Date().toISOString();

  const { error } = await admin
    .from("expenses")
    .update({
      status: "rejected",
      rejection_reason: reason,
      approved_by: auth.userId,
      approved_at: now,
      updated_at: now,
    })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
