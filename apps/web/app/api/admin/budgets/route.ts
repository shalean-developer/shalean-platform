import { NextResponse } from "next/server";
import { loadBudgetWithActuals } from "@/lib/admin/expenses/loadBudgets";
import { requireFinanceApi } from "@/lib/auth/requireFinanceApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireFinanceApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const url = new URL(request.url);
  const budgetId = url.searchParams.get("id");

  if (budgetId) {
    const detail = await loadBudgetWithActuals(admin, budgetId);
    if (!detail) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json(detail);
  }

  const { data, error } = await admin
    .from("finance_budgets")
    .select("id, name, period_type, period_start, period_end, is_active, created_at")
    .eq("is_active", true)
    .order("period_start", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireFinanceApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const body = await request.json();
  const now = new Date().toISOString();

  const { data: budget, error } = await admin
    .from("finance_budgets")
    .insert({
      name: body.name,
      period_type: body.period_type,
      period_start: body.period_start,
      period_end: body.period_end,
      created_by: auth.userId,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (lines.length > 0) {
    const { error: linesErr } = await admin.from("finance_budget_lines").insert(
      lines.map((l: Record<string, unknown>) => ({
        budget_id: budget.id,
        category_id: l.category_id ?? null,
        branch_id: l.branch_id ?? null,
        vendor_id: l.vendor_id ?? null,
        amount_cents: Math.round(Number(l.amount_cents)),
        notes: l.notes ?? null,
      })),
    );
    if (linesErr) return NextResponse.json({ error: linesErr.message }, { status: 500 });
  }

  const detail = await loadBudgetWithActuals(admin, budget.id);
  return NextResponse.json(detail);
}
