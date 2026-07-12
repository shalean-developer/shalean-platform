import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { adjustBookingPayoutEarnings } from "@/lib/payout/adjustBookingPayoutEarnings";
import { adjustBookingTeamMemberPayoutEarnings } from "@/lib/payout/adjustBookingTeamMemberPayoutEarnings";
import { withEarningsAdjustMakerChecker } from "@/lib/payout/earningsAdjustMakerChecker";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: bookingId } = await ctx.params;
  if (!bookingId) return NextResponse.json({ error: "Missing booking id." }, { status: 400 });

  let body: {
    payout_cents?: unknown;
    bonus_cents?: unknown;
    cleaner_id?: unknown;
    adjustment_note?: unknown;
    proposal_id?: unknown;
  };
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

  const cleanerId = typeof body.cleaner_id === "string" ? body.cleaner_id.trim() : "";
  const proposalId = typeof body.proposal_id === "string" ? body.proposal_id.trim() : "";
  const adjustmentNote = typeof body.adjustment_note === "string" ? body.adjustment_note : null;
  const { data: bookingMeta } = await admin
    .from("bookings")
    .select("is_team_job")
    .eq("id", bookingId)
    .maybeSingle();
  const isTeamJob = (bookingMeta as { is_team_job?: boolean | null } | null)?.is_team_job === true;

  const actionType = isTeamJob ? "adjust_team_payout_earnings" : "adjust_payout_earnings";
  const payload = {
    payout_cents: Math.round(payoutCents),
    bonus_cents: Math.round(bonusCents),
    cleaner_id: cleanerId || null,
    adjustment_note: adjustmentNote,
  };

  const applyState: {
    payoutId: string | null;
    batchTotalCents: number | null;
  } = { payoutId: null, batchTotalCents: null };

  const gate = await withEarningsAdjustMakerChecker(admin, {
    actionType,
    bookingId,
    payload,
    adminUserId: auth.userId,
    proposalId: proposalId || null,
    apply: async () => {
      const result = isTeamJob
        ? await adjustBookingTeamMemberPayoutEarnings(admin, {
            bookingId,
            cleanerId,
            payoutCents,
            bonusCents,
            adjustmentNote,
            adminUserId: auth.userId,
          })
        : await adjustBookingPayoutEarnings(admin, {
            bookingId,
            cleanerId: cleanerId || undefined,
            payoutCents,
            bonusCents,
            adjustmentNote,
            adminUserId: auth.userId,
          });
      if (!result.ok) return { ok: false as const, error: result.error, code: result.code };
      applyState.payoutId = result.payoutId;
      applyState.batchTotalCents = result.batchTotalCents;
      return { ok: true as const };
    },
  });

  if (!gate.ok) {
    const status =
      gate.code === "maker_checker_self_approve" ||
      gate.code === "proposal_not_pending" ||
      gate.code === "proposal_expired"
        ? 409
        : gate.code === "proposal_not_found"
          ? 404
          : 400;
    return NextResponse.json({ error: gate.error, code: gate.code }, { status });
  }

  if (gate.mode === "proposed") {
    return NextResponse.json({
      ok: true,
      requires_approval: true,
      proposal_id: gate.proposalId,
      message: "Earnings adjustment proposed. A second admin must approve with proposal_id.",
    });
  }

  return NextResponse.json({
    ok: true,
    payoutId: applyState.payoutId,
    batchTotalCents: applyState.batchTotalCents,
    proposal_id: gate.proposalId ?? null,
  });
}
