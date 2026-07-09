import { NextResponse } from "next/server";
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
  const status = url.searchParams.get("status");

  let query = admin
    .from("recurring_expenses")
    .select(
      "*, expense_categories ( name, group_name ), expense_vendors ( name ), cities ( name ), expense_accounts ( name )",
    )
    .order("next_run_date", { ascending: true });

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
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

  let vendorId = body.vendor_id ? String(body.vendor_id).trim() : null;
  if (!vendorId && body.vendor_name) {
    const vendorName = String(body.vendor_name).trim();
    if (vendorName) {
      const { data: vendor, error: vendorErr } = await admin
        .from("expense_vendors")
        .insert({ name: vendorName })
        .select("id")
        .single();
      if (vendorErr) return NextResponse.json({ error: vendorErr.message }, { status: 500 });
      vendorId = vendor.id;
    }
  }

  const { data, error } = await admin
    .from("recurring_expenses")
    .insert({
      description: body.description,
      category_id: body.category_id,
      vendor_id: vendorId,
      branch_id: body.branch_id,
      amount_cents: Math.round(Number(body.amount_cents)),
      payment_method: body.payment_method ?? "bank_transfer",
      paid_from_account_id: body.paid_from_account_id ?? null,
      frequency: body.frequency,
      next_run_date: body.next_run_date,
      status: "active",
      auto_approve: body.auto_approve !== false,
      notes: body.notes ?? null,
      created_by: auth.userId,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}
