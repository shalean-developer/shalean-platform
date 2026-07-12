import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { refundBookingPayment } from "@/lib/booking/refundBookingPayment";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: bookingId } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as {
    note?: unknown;
    record_only?: unknown;
    refund_reference?: unknown;
    amount_cents?: unknown;
  };
  const note = typeof body.note === "string" ? body.note : undefined;
  const recordOnly = body.record_only === true;
  const refundReference =
    typeof body.refund_reference === "string" ? body.refund_reference.trim() : undefined;
  const amountCents =
    typeof body.amount_cents === "number" && Number.isFinite(body.amount_cents)
      ? Math.round(body.amount_cents)
      : undefined;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const result = await refundBookingPayment(admin, {
    bookingId,
    note,
    recordOnly,
    refundReference,
    amountCents,
  });
  if (!result.ok) {
    const status =
      result.error === "already_refunded"
        ? 409
        : result.error === "booking_not_found"
          ? 404
          : result.error === "monthly_child_use_invoice_refund"
            ? 422
            : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({
    ok: true,
    paystack_refunded: result.paystackRefunded,
    recorded_only: result.recordedOnly,
    already_reversed_on_paystack: result.alreadyReversedOnPaystack,
    refund_reference: result.refundReference,
    refund_status: result.refundStatus,
  });
}
