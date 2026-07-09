import { NextResponse } from "next/server";
import { requireFinanceApi } from "@/lib/auth/requireFinanceApi";
import { loadExpenseList, loadExpenseSummary } from "@/lib/admin/expenses/loadExpenses";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireFinanceApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const url = new URL(request.url);
  const filters = {
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    category_id: url.searchParams.get("category_id") ?? undefined,
    branch_id: url.searchParams.get("branch_id") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    payment_method: url.searchParams.get("payment_method") ?? undefined,
    vendor_id: url.searchParams.get("vendor_id") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
    page: Number(url.searchParams.get("page") ?? "1"),
    page_size: Number(url.searchParams.get("page_size") ?? "25"),
    sort_by: url.searchParams.get("sort_by") ?? undefined,
    sort_dir: (url.searchParams.get("sort_dir") as "asc" | "desc") ?? undefined,
  };

  try {
    const summaryOnly = url.searchParams.get("summary_only") === "1";
    if (summaryOnly) {
      const summary = await loadExpenseSummary(admin);
      return NextResponse.json({ summary });
    }
    const [list, summary] = await Promise.all([
      loadExpenseList(admin, filters),
      loadExpenseSummary(admin),
    ]);
    return NextResponse.json({ ...list, summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load expenses.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireFinanceApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const amountCents = Number(body.amount_cents);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json({ error: "amount_cents must be a positive integer." }, { status: 400 });
  }

  const expenseDate = String(body.expense_date ?? "").trim();
  const categoryId = String(body.category_id ?? "").trim();
  const description = String(body.description ?? "").trim();
  const branchId = String(body.branch_id ?? "").trim();
  const paymentMethod = String(body.payment_method ?? "").trim();

  if (!expenseDate || !categoryId || !description || !branchId || !paymentMethod) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  const vendorId = body.vendor_id ? String(body.vendor_id).trim() : null;
  if (!vendorId && body.vendor_name) {
    const vendorName = String(body.vendor_name).trim();
    if (vendorName) {
      const { data: vendor, error: vendorErr } = await admin
        .from("expense_vendors")
        .insert({ name: vendorName })
        .select("id")
        .single();
      if (vendorErr) return NextResponse.json({ error: vendorErr.message }, { status: 500 });
      body.vendor_id = vendor.id;
    }
  }

  const row = {
    expense_date: expenseDate,
    category_id: categoryId,
    description,
    amount_cents: Math.round(amountCents),
    payment_method: paymentMethod,
    paid_from_account_id: body.paid_from_account_id ? String(body.paid_from_account_id) : null,
    vendor_id: body.vendor_id ? String(body.vendor_id) : null,
    branch_id: branchId,
    booking_id: body.booking_id ? String(body.booking_id) : null,
    receipt_path: body.receipt_path ? String(body.receipt_path) : null,
    receipt_mime: body.receipt_mime ? String(body.receipt_mime) : null,
    notes: body.notes ? String(body.notes) : null,
    status: "pending" as const,
    created_by: auth.userId,
  };

  const { data, error } = await admin.from("expenses").insert(row).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}
