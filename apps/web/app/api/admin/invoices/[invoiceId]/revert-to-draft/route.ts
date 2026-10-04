import { NextResponse } from "next/server";

import {
  rememberIdempotentAdminInvoicePost,
  replayIdempotentAdminInvoicePost,
} from "@/lib/admin/adminInvoiceIdempotency";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { revertManualPaidMonthlyInvoiceToDraft } from "@/lib/monthlyInvoice/revertManualPaidMonthlyInvoiceToDraft";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ invoiceId: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { invoiceId } = await ctx.params;
  if (!invoiceId) return NextResponse.json({ error: "Missing invoice id." }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as { typedConfirm?: unknown; reason?: unknown };
  if (String(body.typedConfirm ?? "").trim() !== "REVERT") {
    return NextResponse.json({ error: "typed_confirm_invalid" }, { status: 400 });
  }
  const reason = String(body.reason ?? "").trim();
  if (!reason) return NextResponse.json({ error: "reason_required" }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const replay = await replayIdempotentAdminInvoicePost(admin, request, invoiceId, "revert_manual_paid");
  if (replay) return replay;

  const result = await revertManualPaidMonthlyInvoiceToDraft(admin, {
    invoiceId,
    adminEmail: auth.email,
    adminUserId: auth.userId,
    reason,
  });

  if (!result.ok) {
    const conflictErrors = [
      "invoice_not_paid_closed",
      "real_paystack_payment_exists",
      "manual_mark_paid_event_missing",
      "manual_mark_paid_not_reversible_to_clean_draft",
    ];
    return NextResponse.json(
      { error: result.error },
      { status: conflictErrors.some((x) => result.error === x || result.error.startsWith("booking_payout_already_disbursed:")) ? 409 : 400 },
    );
  }

  const payload = {
    ok: true as const,
    restoredBookingCount: result.restoredBookingIds.length,
    zohoReconciliationRequired: result.zohoReconciliationRequired,
  };
  await rememberIdempotentAdminInvoicePost(admin, request, invoiceId, "revert_manual_paid", 200, payload);
  return NextResponse.json(payload);
}
