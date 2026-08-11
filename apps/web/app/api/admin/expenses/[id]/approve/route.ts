import { NextResponse } from "next/server";
import { approveExpenseWorkflow } from "@/lib/admin/expenses/expenseApprovalService";
import { canSpendDiscretionary, classifyBudgetCashPolicy } from "@/lib/admin/expenses/budgetCashClassification";
import { loadCashSurvivalDashboard } from "@/lib/admin/expenses/loadCashSurvivalDashboard";
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

  const { id } = await ctx.params;
  let comment: string | null = null;
  try {
    const body = await request.json();
    comment = typeof body?.comment === "string" ? body.comment : null;
  } catch {
    /* optional body */
  }

  const { data: expense, error: expenseErr } = await admin
    .from("expenses")
    .select("id, amount_cents, category_id, description")
    .eq("id", id)
    .maybeSingle();
  if (expenseErr) return NextResponse.json({ error: expenseErr.message }, { status: 500 });
  if (!expense) return NextResponse.json({ error: "Not found." }, { status: 404 });

  let categoryName = "";
  if (expense.category_id) {
    const { data: category } = await admin
      .from("expense_categories")
      .select("name")
      .eq("id", expense.category_id)
      .maybeSingle();
    categoryName = String(category?.name ?? "");
  }

  const cashPolicy = classifyBudgetCashPolicy(categoryName || String(expense.description ?? ""));
  if (cashPolicy.requiresSafeToSpend) {
    const survival = await loadCashSurvivalDashboard(admin);
    const gate = canSpendDiscretionary({
      requestedCents: Number(expense.amount_cents ?? 0),
      safeToSpendCents: Number(survival.decision.safe_to_spend_cents ?? 0),
      bankBalanceFresh: survival.data_quality.bank_balance_fresh,
    });
    if (!gate.allowed) {
      return NextResponse.json(
        {
          error: gate.reason ?? "Expense is blocked by cash-control policy.",
          code: "cash_control_blocked",
          cash_class: cashPolicy.cashClass,
          safe_to_spend_cents: survival.decision.safe_to_spend_cents,
          funding_gap_cents: survival.decision.funding_gap_cents,
          cash_status: survival.status,
          cash_flow_path: "/office/cash-flow",
        },
        { status: 409 },
      );
    }
  }

  const result = await approveExpenseWorkflow(admin, id, auth.userId, auth.email, comment);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({
    ok: true,
    status: result.status,
    approval_stage: result.approval_stage,
    cash_class: cashPolicy.cashClass,
  });
}
