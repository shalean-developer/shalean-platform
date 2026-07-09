import { NextResponse } from "next/server";
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
  const { data, error } = await admin
    .from("expenses")
    .select(
      `*,
      expense_categories ( name, group_name ),
      expense_vendors ( name, contact_person, phone, email ),
      cities ( name ),
      expense_accounts ( name )`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ expense: data });
}

export async function PATCH(request: Request, ctx: RouteCtx) {
  const auth = await requireFinanceApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const allowed = [
    "expense_date",
    "category_id",
    "description",
    "amount_cents",
    "payment_method",
    "paid_from_account_id",
    "vendor_id",
    "branch_id",
    "booking_id",
    "receipt_path",
    "receipt_mime",
    "notes",
  ] as const;

  for (const key of allowed) {
    if (body[key] !== undefined) patch[key] = body[key];
  }

  if (patch.amount_cents != null) {
    const cents = Number(patch.amount_cents);
    if (!Number.isFinite(cents) || cents <= 0) {
      return NextResponse.json({ error: "amount_cents must be positive." }, { status: 400 });
    }
    patch.amount_cents = Math.round(cents);
  }

  const { error } = await admin.from("expenses").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, ctx: RouteCtx) {
  const auth = await requireFinanceApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { id } = await ctx.params;
  const { data: existing } = await admin.from("expenses").select("receipt_path").eq("id", id).maybeSingle();

  const { error } = await admin.from("expenses").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (existing?.receipt_path) {
    await admin.storage.from("expense-receipts").remove([existing.receipt_path]);
  }

  return NextResponse.json({ ok: true });
}
