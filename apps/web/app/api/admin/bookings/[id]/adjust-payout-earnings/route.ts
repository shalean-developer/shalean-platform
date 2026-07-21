import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { adjustVisitPayoutEarnings } from "@/lib/payout/adjustVisitPayoutEarnings";
import { classifyVisitPayoutEdit } from "@/lib/payout/classifyVisitPayoutEdit";
import { withEarningsAdjustMakerChecker } from "@/lib/payout/earningsAdjustMakerChecker";
import { buildEarningsAdjustProposePayload } from "@/lib/payout/moneyActionProposalPayload";
import { resolveCleanerDashboardEarningsCents } from "@/lib/cleaner/resolveCleanerEarnings";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Propose (no proposal_id) or approve (proposal_id only for financial fields).
 * When proposal_id is present, body financial fields are ignored — stored payload is applied.
 */
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

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const proposalId = typeof body.proposal_id === "string" ? body.proposal_id.trim() : "";

  // --- Approve via legacy path: proposal_id only; ignore financial body fields ---
  if (proposalId) {
    const gate = await withEarningsAdjustMakerChecker(admin, {
      actionType: "adjust_payout_earnings",
      bookingId,
      payload: {},
      adminUserId: auth.userId,
      adminEmail: auth.email,
      proposalId,
      apply: async () => ({ ok: true as const }),
    });

    if (!gate.ok) {
      const status =
        gate.code === "maker_checker_self_approve" ||
        gate.code === "proposal_not_pending" ||
        gate.code === "proposal_expired" ||
        gate.code === "proposal_already_rejected" ||
        gate.code === "proposal_failed" ||
        gate.code === "proposal_booking_mismatch" ||
        gate.code === "proposal_duplicate_pending"
          ? 409
          : gate.code === "proposal_not_found"
            ? 404
            : gate.code === "read_after_write_mismatch" ||
                gate.code === "audit_persist_failed" ||
                gate.code === "proposal_terminal_update_failed"
              ? 409
              : 400;
      return NextResponse.json(
        {
          error: gate.error,
          code: gate.code,
          existing_proposal_id: gate.existingProposalId ?? null,
        },
        { status },
      );
    }

    return NextResponse.json({
      ok: true,
      applied: true,
      requires_approval: false,
      proposal_id: gate.proposalId ?? proposalId,
      already_processed: gate.alreadyProcessed === true,
      message:
        "Approved from stored proposal payload. Prefer POST /api/admin/money-action-proposals/:id/approve.",
    });
  }

  // --- Propose path ---
  const payoutCents = Number(body.payout_cents);
  if (!Number.isFinite(payoutCents) || payoutCents < 0) {
    return NextResponse.json({ error: "payout_cents must be a non-negative number." }, { status: 400 });
  }

  const bonusCents = body.bonus_cents == null ? 0 : Number(body.bonus_cents);
  if (!Number.isFinite(bonusCents) || bonusCents < 0) {
    return NextResponse.json({ error: "bonus_cents must be a non-negative number." }, { status: 400 });
  }

  const cleanerId = typeof body.cleaner_id === "string" ? body.cleaner_id.trim() : "";
  const adjustmentNote = typeof body.adjustment_note === "string" ? body.adjustment_note : null;

  const { data: bookingMeta, error: metaErr } = await admin
    .from("bookings")
    .select(
      "is_team_job, cleaner_id, payout_owner_cleaner_id, team_id, earnings_summary, cleaner_payout_cents, cleaner_bonus_cents, display_earnings_cents, cleaner_earnings_total_cents, payout_frozen_cents",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (metaErr) return NextResponse.json({ error: metaErr.message }, { status: 400 });
  if (!bookingMeta) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  const meta = bookingMeta as {
    is_team_job?: boolean | null;
    cleaner_id?: string | null;
    payout_owner_cleaner_id?: string | null;
    team_id?: string | null;
    earnings_summary?: unknown;
    cleaner_payout_cents?: number | null;
    cleaner_bonus_cents?: number | null;
    display_earnings_cents?: number | null;
    cleaner_earnings_total_cents?: number | null;
    payout_frozen_cents?: number | null;
  };

  const { data: rosterRows } = await admin.from("booking_cleaners").select("cleaner_id").eq("booking_id", bookingId);
  const rosterCleanerIds = (rosterRows ?? [])
    .map((r) => String((r as { cleaner_id?: string }).cleaner_id ?? "").trim())
    .filter(Boolean);

  let hasTeamMemberPayoutRow = false;
  let hasRosterMemberPayoutRow = false;
  if (cleanerId) {
    const { data: tj } = await admin
      .from("team_job_member_payouts")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("cleaner_id", cleanerId)
      .maybeSingle();
    hasTeamMemberPayoutRow = Boolean(tj);
    const { data: rp } = await admin
      .from("booking_roster_member_payouts")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("cleaner_id", cleanerId)
      .maybeSingle();
    hasRosterMemberPayoutRow = Boolean(rp);
  }

  const editMode = classifyVisitPayoutEdit({
    is_team_job: meta.is_team_job,
    cleaner_id: meta.cleaner_id,
    payout_owner_cleaner_id: meta.payout_owner_cleaner_id,
    team_id: meta.team_id,
    earnings_summary: meta.earnings_summary,
    rosterCleanerIds,
    hasTeamMemberPayoutRow,
    hasRosterMemberPayoutRow,
    requestedCleanerId: cleanerId,
  });

  const actionType = editMode === "per_cleaner" ? "adjust_team_payout_earnings" : "adjust_payout_earnings";

  const targetCleanerId =
    cleanerId ||
    String(meta.cleaner_id ?? "").trim() ||
    String(meta.payout_owner_cleaner_id ?? "").trim() ||
    "";

  const originalTotalCents = targetCleanerId
    ? resolveCleanerDashboardEarningsCents(meta, targetCleanerId)
    : Math.max(
        0,
        Math.round(Number(meta.display_earnings_cents ?? 0)) ||
          Math.round(Number(meta.cleaner_payout_cents ?? 0) + Number(meta.cleaner_bonus_cents ?? 0)),
      );

  const originalPayoutCents = Math.round(Number(meta.cleaner_payout_cents ?? originalTotalCents));
  const originalBonusCents = Math.round(Number(meta.cleaner_bonus_cents ?? 0));

  const payload = buildEarningsAdjustProposePayload({
    payoutCents: Math.round(payoutCents),
    bonusCents: Math.round(bonusCents),
    cleanerId: cleanerId || null,
    adjustmentNote,
    editMode,
    originalPayoutCents,
    originalBonusCents,
    originalTotalCents,
  });

  const applyState: {
    payoutId: string | null;
    batchTotalCents: number | null;
    mode: "solo_owner" | "per_cleaner" | null;
  } = { payoutId: null, batchTotalCents: null, mode: null };

  const gate = await withEarningsAdjustMakerChecker(admin, {
    actionType,
    bookingId,
    payload,
    adminUserId: auth.userId,
    adminEmail: auth.email,
    proposalId: null,
    apply: async () => {
      const result = await adjustVisitPayoutEarnings(admin, {
        bookingId,
        cleanerId: cleanerId || null,
        payoutCents,
        bonusCents,
        adjustmentNote,
        adminUserId: auth.userId,
      });
      if (!result.ok) return { ok: false as const, error: result.error, code: result.code };
      applyState.payoutId = result.payoutId;
      applyState.batchTotalCents = result.batchTotalCents;
      applyState.mode = result.mode;
      return { ok: true as const };
    },
  });

  if (!gate.ok) {
    const status =
      gate.code === "maker_checker_self_approve" ||
      gate.code === "proposal_not_pending" ||
      gate.code === "proposal_expired" ||
      gate.code === "proposal_duplicate_pending"
        ? 409
        : gate.code === "proposal_not_found"
          ? 404
          : gate.code === "read_after_write_mismatch" || gate.code === "audit_persist_failed"
            ? 409
            : 400;
    return NextResponse.json(
      {
        error: gate.error,
        code: gate.code,
        existing_proposal_id: gate.existingProposalId ?? null,
        approvals_path: "/office/payouts/approvals",
      },
      { status },
    );
  }

  if (gate.mode === "proposed") {
    return NextResponse.json({
      ok: true,
      requires_approval: true,
      applied: false,
      proposal_id: gate.proposalId,
      edit_mode: editMode,
      approvals_path: `/office/payouts/approvals?highlight=${encodeURIComponent(gate.proposalId)}`,
      message: "Earnings adjustment proposed. A second admin must approve in Office Approvals.",
    });
  }

  return NextResponse.json({
    ok: true,
    applied: true,
    requires_approval: false,
    payoutId: applyState.payoutId,
    batchTotalCents: applyState.batchTotalCents,
    edit_mode: applyState.mode ?? editMode,
    proposal_id: gate.proposalId ?? null,
  });
}
