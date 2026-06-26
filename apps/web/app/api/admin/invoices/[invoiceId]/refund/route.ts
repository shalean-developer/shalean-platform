import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { refundMonthlyInvoicePayment } from "@/lib/monthlyInvoice/refundMonthlyInvoicePayment";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ invoiceId: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { invoiceId } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as {
    note?: unknown;
    record_only?: unknown;
    refund_reference?: unknown;
  };
  const note = typeof body.note === "string" ? body.note : undefined;
  const recordOnly = body.record_only === true;
  const refundReference =
    typeof body.refund_reference === "string" ? body.refund_reference.trim() : undefined;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const result = await refundMonthlyInvoicePayment(admin, {
    invoiceId,
    note,
    recordOnly,
    refundReference,
  });
  if (!result.ok) {
    const status =
      result.error === "already_refunded"
        ? 409
        : result.error === "invoice_not_found"
          ? 404
          : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({
    ok: true,
    paystack_refunded: result.paystackRefunded,
    recorded_only: result.recordedOnly,
    already_reversed_on_paystack: result.alreadyReversedOnPaystack,
    refund_reference: result.refundReference,
    payout_eligible_bookings: result.payoutEligibleBookings,
  });
}
