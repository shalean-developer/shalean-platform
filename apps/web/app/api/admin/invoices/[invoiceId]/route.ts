import { NextResponse } from "next/server";

import { loadAdminInvoiceBundle } from "@/lib/admin/invoices/loadAdminInvoiceBundle";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { setDraftMonthlyInvoiceDueDateOverride } from "@/lib/monthlyInvoice/setDraftMonthlyInvoiceDueDateOverride";
import { syncMonthlyInvoiceToZohoBooks } from "@/lib/monthlyInvoice/syncMonthlyInvoiceToZohoBooks";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ invoiceId: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { invoiceId } = await ctx.params;
  if (!invoiceId) return NextResponse.json({ error: "Missing invoice id." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const bundle = await loadAdminInvoiceBundle(admin, invoiceId);
  if (!bundle.ok) {
    if (bundle.error === "not_found") return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    return NextResponse.json({ error: bundle.message ?? "Load failed." }, { status: 500 });
  }

  return NextResponse.json(bundle.data);
}

export async function PATCH(request: Request, ctx: { params: Promise<{ invoiceId: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { invoiceId } = await ctx.params;
  if (!invoiceId) return NextResponse.json({ error: "Missing invoice id." }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as { dueDate?: unknown };
  const dueDate = String(body.dueDate ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return NextResponse.json({ error: "dueDate must be YYYY-MM-DD." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const set = await setDraftMonthlyInvoiceDueDateOverride(admin, invoiceId, dueDate);
  if (!set.ok) {
    const status = set.error === "not_found" ? 404 : set.error === "invoice_not_draft" ? 409 : 400;
    return NextResponse.json({ error: set.error }, { status });
  }

  const { data: inv } = await admin
    .from("monthly_invoices")
    .select("id, customer_id, month, due_date, status, total_amount_cents, zoho_invoice_id")
    .eq("id", invoiceId)
    .maybeSingle();

  const row = inv as {
    id: string;
    customer_id: string;
    month: string;
    due_date: string;
    status: string | null;
    total_amount_cents: number | null;
  } | null;

  if (row && String(row.status ?? "").toLowerCase() === "draft") {
    const balanceZar = Math.max(0, Math.round(Number(row.total_amount_cents ?? 0))) / 100;
    if (balanceZar > 0) {
      await syncMonthlyInvoiceToZohoBooks(admin, {
        invoiceId: row.id,
        customerId: row.customer_id,
        month: row.month,
        dueDate: row.due_date,
        balanceZar,
        status: row.status,
      });
    }
  }

  return NextResponse.json({ ok: true, dueDate });
}
