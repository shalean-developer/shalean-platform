import { NextResponse } from "next/server";
import { loadExpenseApprovalHistory } from "@/lib/admin/expenses/expenseApprovalService";
import { requiredApprovalStages } from "@/lib/admin/expenses/approvalWorkflow";
import { requireFinanceApi } from "@/lib/auth/requireFinanceApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: RouteCtx) {
  const auth = await requireFinanceApi(_request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { id } = await ctx.params;
  const { data: expense } = await admin
    .from("expenses")
    .select("id, amount_cents, status, approval_stage")
    .eq("id", id)
    .maybeSingle();

  if (!expense) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const history = await loadExpenseApprovalHistory(admin, id);
  return NextResponse.json({
    expense_id: id,
    approval_stage: expense.approval_stage,
    status: expense.status,
    required_stages: requiredApprovalStages(expense.amount_cents),
    history,
  });
}
