import { NextResponse } from "next/server";
import { approveExpenseWorkflow } from "@/lib/admin/expenses/expenseApprovalService";
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

  const result = await approveExpenseWorkflow(admin, id, auth.userId, auth.email, comment);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({
    ok: true,
    status: result.status,
    approval_stage: result.approval_stage,
  });
}
