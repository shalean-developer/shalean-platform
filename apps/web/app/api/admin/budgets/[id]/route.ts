import { NextResponse } from "next/server";
import { loadBudgetWithActuals } from "@/lib/admin/expenses/loadBudgets";
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
  const now = new Date().toISOString();

  const { data: existing, error: findErr } = await admin
    .from("finance_budgets")
    .select("id")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();

  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: now };
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (body.period_type === "month" || body.period_type === "year") patch.period_type = body.period_type;
  if (typeof body.period_start === "string") patch.period_start = body.period_start;
  if (typeof body.period_end === "string") patch.period_end = body.period_end;

  const { error: updateErr } = await admin.from("finance_budgets").update(patch).eq("id", id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  if (Array.isArray(body.lines)) {
    const { error: deleteErr } = await admin.from("finance_budget_lines").delete().eq("budget_id", id);
    if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });

    if (body.lines.length > 0) {
      const { error: linesErr } = await admin.from("finance_budget_lines").insert(
        body.lines.map((l: Record<string, unknown>) => ({
          budget_id: id,
          category_id: l.category_id ?? null,
          branch_id: l.branch_id ?? null,
          vendor_id: l.vendor_id ?? null,
          service_slug: l.service_slug ?? null,
          is_total_line: l.is_total_line === true,
          amount_cents: Math.round(Number(l.amount_cents)),
          notes: l.notes ?? null,
        })),
      );
      if (linesErr) return NextResponse.json({ error: linesErr.message }, { status: 500 });
    }
  }

  const detail = await loadBudgetWithActuals(admin, id);
  return NextResponse.json(detail);
}
