import { NextResponse } from "next/server";

import {
  rememberIdempotentAdminInvoicePost,
  replayIdempotentAdminInvoicePost,
} from "@/lib/admin/adminInvoiceIdempotency";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { finalizeAndSendMonthlyInvoice } from "@/lib/monthlyInvoice/finalizeAndSendMonthlyInvoice";
import { syncDraftMonthlyInvoiceToZohoAfterRecompute } from "@/lib/monthlyInvoice/syncMonthlyInvoiceToZohoBooks";
import { todayJohannesburg } from "@/lib/recurring/johannesburgCalendar";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Finalize draft → sent, email customer with Paystack link (admin early send allowed). */
export async function POST(request: Request, ctx: { params: Promise<{ invoiceId: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { invoiceId } = await ctx.params;
  if (!invoiceId) return NextResponse.json({ error: "Missing invoice id." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const replay = await replayIdempotentAdminInvoicePost(admin, request, invoiceId, "send_invoice");
  if (replay) return replay;

  const body = (await request.json().catch(() => ({}))) as { forceEarlySend?: unknown };
  const forceEarlySend = body.forceEarlySend !== false;

  const { data: inv, error: invErr } = await admin
    .from("monthly_invoices")
    .select("id, customer_id, month, status, is_closed")
    .eq("id", invoiceId)
    .maybeSingle();

  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 });
  if (!inv) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

  const row = inv as {
    customer_id: string;
    month: string;
    status: string | null;
    is_closed: boolean | null;
  };

  if (row.is_closed) {
    return NextResponse.json({ error: "This billing month is closed." }, { status: 409 });
  }
  if (String(row.status ?? "").toLowerCase() !== "draft") {
    return NextResponse.json({ error: "Only draft invoices can be sent." }, { status: 409 });
  }

  await syncDraftMonthlyInvoiceToZohoAfterRecompute(admin, invoiceId);

  const result = await finalizeAndSendMonthlyInvoice(admin, {
    invoiceId,
    customerId: row.customer_id,
    month: row.month,
    todayYmd: todayJohannesburg(),
    forceEarlySend,
    actor: auth.email ?? `admin:${auth.userId}`,
    source: "admin/send-monthly-invoice",
  });

  if (!result.ok) {
    if ("skipped" in result) {
      return NextResponse.json(
        {
          error: "Invoice is not ready for automatic finalize yet.",
          reason: result.reason,
          hint: "Retry with forceEarlySend=true (default for admin send) to send before the last visit.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  if (result.outcome === "paid_zero") {
    const payload = { ok: true as const, outcome: "paid_zero" as const };
    await rememberIdempotentAdminInvoicePost(admin, request, invoiceId, "send_invoice", 200, payload);
    return NextResponse.json(payload);
  }

  const payload = {
    ok: true as const,
    outcome: "sent" as const,
    paymentUrl: result.paymentUrl,
    sentAt: result.sentAt,
    alreadyEmailed: result.alreadyEmailed,
  };
  await rememberIdempotentAdminInvoicePost(admin, request, invoiceId, "send_invoice", 200, payload);
  return NextResponse.json(payload);
}
