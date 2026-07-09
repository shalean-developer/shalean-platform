import { NextResponse } from "next/server";
import { rejectExpenseWorkflow } from "@/lib/admin/expenses/expenseApprovalService";
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
  const body = await request.json().catch(() => ({}));
  const rejectionReason = typeof body?.rejection_reason === "string" ? body.rejection_reason : "";
  const comment = typeof body?.comment === "string" ? body.comment : null;

  const result = await rejectExpenseWorkflow(admin, id, auth.userId, auth.email, rejectionReason, comment);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ ok: true, approval_stage: result.approval_stage });
}
