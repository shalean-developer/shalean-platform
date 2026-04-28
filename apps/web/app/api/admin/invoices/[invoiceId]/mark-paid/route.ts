import { NextResponse } from "next/server";

import {
  rememberIdempotentAdminInvoicePost,
  replayIdempotentAdminInvoicePost,
} from "@/lib/admin/adminInvoiceIdempotency";
import { markMonthlyInvoicePaidManual } from "@/lib/monthlyInvoice/markMonthlyInvoicePaidManual";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ invoiceId: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { invoiceId } = await ctx.params;
  if (!invoiceId) return NextResponse.json({ error: "Missing invoice id." }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as { typedConfirm?: unknown; note?: unknown };
  const typed = String(body.typedConfirm ?? "").trim();
  if (typed !== "PAID") {
    return NextResponse.json({ error: "typed_confirm_invalid" }, { status: 400 });
  }
  const note = typeof body.note === "string" ? body.note : undefined;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const replay = await replayIdempotentAdminInvoicePost(admin, request, invoiceId, "mark_paid");
  if (replay) return replay;

  const result = await markMonthlyInvoicePaidManual(admin, {
    invoiceId,
    adminEmail: auth.email,
    adminUserId: auth.userId,
    note,
  });
  if (!result.ok) {
    const code =
      result.error === "already_paid" || result.error === "invoice_already_closed"
        ? 409
        : result.error === "invalid_status_for_manual_pay"
          ? 400
          : 400;
    return NextResponse.json({ error: result.error }, { status: code });
  }

  const payload = { ok: true as const };
  await rememberIdempotentAdminInvoicePost(admin, request, invoiceId, "mark_paid", 200, payload);
  return NextResponse.json(payload);
}
