import { NextResponse } from "next/server";

import {
  rememberIdempotentAdminInvoicePost,
  replayIdempotentAdminInvoicePost,
} from "@/lib/admin/adminInvoiceIdempotency";
import { parseAdjustmentCategory } from "@/lib/monthlyInvoice/adjustmentCategory";
import { insertInvoiceAdjustment } from "@/lib/monthlyInvoice/insertInvoiceAdjustment";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ invoiceId: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { invoiceId } = await ctx.params;
  if (!invoiceId) return NextResponse.json({ error: "Missing invoice id." }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as {
    amountCents?: unknown;
    reason?: unknown;
    category?: unknown;
  };
  const amountCents = Math.round(Number(body.amountCents));
  const reason = String(body.reason ?? "").trim();
  const category = parseAdjustmentCategory(body.category);
  if (!reason) return NextResponse.json({ error: "Reason is required." }, { status: 400 });
  if (!Number.isFinite(amountCents) || amountCents === 0) {
    return NextResponse.json({ error: "amountCents must be a non-zero integer (ZAR cents)." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const replay = await replayIdempotentAdminInvoicePost(admin, request, invoiceId, "adjustment");
  if (replay) return replay;

  const { data: inv, error: invErr } = await admin
    .from("monthly_invoices")
    .select("id, customer_id, month, status, is_closed")
    .eq("id", invoiceId)
    .maybeSingle();

  if (invErr || !inv) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

  const row = inv as { customer_id: string; month: string; status: string | null; is_closed: boolean | null };
  if (row.is_closed) {
    return NextResponse.json({ error: "This billing month is closed for adjustments." }, { status: 409 });
  }

  const ins = await insertInvoiceAdjustment(admin, {
    customerId: row.customer_id,
    amountCents,
    reason,
    monthApplied: row.month,
    createdBy: auth.userId,
    category,
  });

  if (!ins.ok) return NextResponse.json({ error: ins.error }, { status: 400 });

  const st = String(row.status ?? "").toLowerCase();
  if (st === "draft") {
    await admin.rpc("recompute_monthly_invoice_totals", { p_invoice_id: invoiceId });
  }

  const payload = { ok: true as const, adjustmentId: ins.id };
  await rememberIdempotentAdminInvoicePost(admin, request, invoiceId, "adjustment", 200, payload);
  return NextResponse.json(payload);
}
