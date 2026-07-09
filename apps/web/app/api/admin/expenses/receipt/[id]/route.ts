import { NextResponse } from "next/server";
import { requireFinanceApi } from "@/lib/auth/requireFinanceApi";
import { EXPENSE_RECEIPT_BUCKET } from "@/lib/admin/expenses/receiptStorage";
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
  const { data: expense, error } = await admin
    .from("expenses")
    .select("receipt_path, receipt_mime")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!expense?.receipt_path) return NextResponse.json({ error: "No receipt." }, { status: 404 });

  const { data: signed, error: signErr } = await admin.storage
    .from(EXPENSE_RECEIPT_BUCKET)
    .createSignedUrl(expense.receipt_path, 3600);

  if (signErr) return NextResponse.json({ error: signErr.message }, { status: 500 });

  return NextResponse.json({
    signed_url: signed?.signedUrl ?? null,
    mime: expense.receipt_mime,
  });
}
