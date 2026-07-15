import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { refundBookingPayment } from "@/lib/booking/refund/refundBookingPayment";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: bookingId } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as {
    note?: unknown;
    cancellation_reason?: unknown;
    record_only?: unknown;
    refund_reference?: unknown;
    amount_cents?: unknown;
    proposal_id?: unknown;
    retry_refund_id?: unknown;
  };
  const note = typeof body.note === "string" ? body.note : undefined;
  const cancellationReason =
    typeof body.cancellation_reason === "string" ? body.cancellation_reason : undefined;
  const recordOnly = body.record_only === true;
  const refundReference =
    typeof body.refund_reference === "string" ? body.refund_reference.trim() : undefined;
  const amountCents =
    typeof body.amount_cents === "number" && Number.isFinite(body.amount_cents)
      ? Math.round(body.amount_cents)
      : undefined;
  const proposalId = typeof body.proposal_id === "string" ? body.proposal_id.trim() : undefined;
  const retryRefundId =
    typeof body.retry_refund_id === "string" ? body.retry_refund_id.trim() : undefined;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const result = await refundBookingPayment(admin, {
    bookingId,
    note,
    cancellationReason,
    recordOnly,
    refundReference,
    amountCents,
    proposalId,
    retryRefundId,
    adminUserId: auth.userId,
    adminEmail: auth.email,
  });
  if (!result.ok) {
    const status =
      result.error === "already_refunded" || result.error === "already_fully_refunded"
        ? 409
        : result.error === "booking_not_found"
          ? 404
          : result.error === "monthly_child_use_invoice_refund"
            ? 422
            : result.code === "maker_checker_self_approve"
              ? 403
              : 400;
    return NextResponse.json({ error: result.error, code: result.code ?? null }, { status });
  }

  if (result.mode === "proposed") {
    return NextResponse.json({
      ok: true,
      mode: "proposed",
      proposal_id: result.proposalId,
      refund_status: result.refundStatus,
      amount_cents: result.amountCents,
      refundable_remaining_cents: result.refundableRemainingCents,
    });
  }

  return NextResponse.json({
    ok: true,
    mode: "applied",
    paystack_refunded: result.paystackRefunded,
    recorded_only: result.recordedOnly,
    already_reversed_on_paystack: result.alreadyReversedOnPaystack,
    refund_reference: result.refundReference,
    refund_status: result.refundStatus,
    refund_id: result.refundId,
    provider_state: result.providerState,
    amount_cents: result.amountCents,
    refundable_remaining_cents: result.refundableRemainingCents,
  });
}
