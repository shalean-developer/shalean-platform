import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { adjustBookingPayoutEarnings } from "@/lib/payout/adjustBookingPayoutEarnings";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: bookingId } = await ctx.params;
  if (!bookingId) return NextResponse.json({ error: "Missing booking id." }, { status: 400 });

  let body: { payout_cents?: unknown; bonus_cents?: unknown; adjustment_note?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const payoutCents = Number(body.payout_cents);
  if (!Number.isFinite(payoutCents) || payoutCents < 0) {
    return NextResponse.json({ error: "payout_cents must be a non-negative number." }, { status: 400 });
  }

  const bonusCents = body.bonus_cents == null ? 0 : Number(body.bonus_cents);
  if (!Number.isFinite(bonusCents) || bonusCents < 0) {
    return NextResponse.json({ error: "bonus_cents must be a non-negative number." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const result = await adjustBookingPayoutEarnings(admin, {
    bookingId,
    payoutCents,
    bonusCents,
    adjustmentNote: typeof body.adjustment_note === "string" ? body.adjustment_note : null,
    adminUserId: auth.userId,
  });

  if (!result.ok) {
    const status =
      result.code === "booking_not_found"
        ? 404
        : result.code === "payout_exceeds_financial_cap" ||
            result.code === "team_job_not_supported" ||
            result.code === "booking_payout_paid" ||
            result.code === "payout_batch_locked"
          ? 409
          : 400;
    return NextResponse.json({ error: result.error, code: result.code }, { status });
  }

  return NextResponse.json({
    ok: true,
    payoutId: result.payoutId,
    batchTotalCents: result.batchTotalCents,
  });
}
