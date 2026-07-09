import { NextResponse } from "next/server";
import { requireFinanceApi } from "@/lib/auth/requireFinanceApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: RouteCtx) {
  const auth = await requireFinanceApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { id } = await ctx.params;
  const body = await request.json();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  const allowed = [
    "description",
    "category_id",
    "vendor_id",
    "branch_id",
    "amount_cents",
    "payment_method",
    "paid_from_account_id",
    "frequency",
    "next_run_date",
    "status",
    "auto_approve",
    "notes",
  ] as const;

  for (const key of allowed) {
    if (body[key] !== undefined) patch[key] = body[key];
  }
  if (patch.amount_cents != null) patch.amount_cents = Math.round(Number(patch.amount_cents));

  const { error } = await admin.from("recurring_expenses").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, ctx: RouteCtx) {
  const auth = await requireFinanceApi(_request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { id } = await ctx.params;
  const { error } = await admin
    .from("recurring_expenses")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
