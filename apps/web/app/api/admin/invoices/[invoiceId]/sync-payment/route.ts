import { NextResponse } from "next/server";

import {
  rememberIdempotentAdminInvoicePost,
  replayIdempotentAdminInvoicePost,
} from "@/lib/admin/adminInvoiceIdempotency";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { syncMonthlyInvoicePaymentFromPaystack } from "@/lib/monthlyInvoice/syncMonthlyInvoicePaymentFromPaystack";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ invoiceId: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { invoiceId } = await ctx.params;
  if (!invoiceId) return NextResponse.json({ error: "Missing invoice id." }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as { reference?: unknown };
  const paystackReference = typeof body.reference === "string" ? body.reference.trim() : undefined;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const replay = await replayIdempotentAdminInvoicePost(admin, request, invoiceId, "sync_payment");
  if (replay) return replay;

  const result = await syncMonthlyInvoicePaymentFromPaystack(admin, {
    invoiceId,
    paystackReference,
  });
  if (!result.ok) {
    const code =
      result.error === "invoice_not_found"
        ? 404
        : result.error === "paystack_payment_not_success" || result.error === "paystack_payment_failed"
          ? 409
          : 400;
    return NextResponse.json({ error: result.error }, { status: code });
  }

  const payload = {
    ok: true as const,
    settled: result.settled,
    invoiceId: result.invoiceId,
    reference: result.reference,
  };
  await rememberIdempotentAdminInvoicePost(admin, request, invoiceId, "sync_payment", 200, payload);
  return NextResponse.json(payload);
}
