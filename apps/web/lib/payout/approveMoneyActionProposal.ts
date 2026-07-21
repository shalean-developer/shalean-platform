import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { adjustVisitPayoutEarnings } from "@/lib/payout/adjustVisitPayoutEarnings";
import { claimMoneyActionProposalForApprove } from "@/lib/payout/claimMoneyActionProposal";
import { isEarningsAdjustActionType } from "@/lib/payout/moneyActionProposalTypes";
import { parseEarningsAdjustPayload } from "@/lib/payout/moneyActionProposalPayload";
import { logPayoutAuditEvent } from "@/lib/payout/payoutAudit";

export type ApproveMoneyActionProposalResult =
  | {
      ok: true;
      status: "approved";
      proposalId: string;
      applied: true;
      alreadyProcessed?: boolean;
      payoutId: string | null;
      batchTotalCents: number | null;
      edit_mode: "solo_owner" | "per_cleaner" | string;
    }
  | { ok: false; error: string; code: string };

async function markProposalTerminal(
  admin: SupabaseClient,
  params: {
    proposalId: string;
    status: "approved" | "failed";
    actorUserId: string;
    reviewNote?: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: string; code: string }> {
  const patch: Record<string, unknown> = {
    status: params.status,
    reviewed_by: params.actorUserId,
    reviewed_at: new Date().toISOString(),
  };
  if (params.reviewNote != null) patch.review_note = params.reviewNote;

  const { data, error } = await admin
    .from("admin_money_action_proposals")
    .update(patch)
    .eq("id", params.proposalId)
    .eq("status", "processing")
    .select("id");

  if (error) {
    return { ok: false, error: error.message, code: "proposal_terminal_update_failed" };
  }
  if (!data?.length) {
    return {
      ok: false,
      error: "Could not finalize proposal status after claim.",
      code: "proposal_terminal_update_failed",
    };
  }
  return { ok: true };
}

/**
 * Approve an earnings-adjust proposal using the stored payload only.
 * Atomic claim (pending→processing) precedes any financial mutation.
 */
export async function approveMoneyActionProposal(
  admin: SupabaseClient,
  params: {
    proposalId: string;
    actorUserId: string;
    actorEmail?: string | null;
    /** When set (legacy booking-scoped route), must match proposal.booking_id before claim. */
    expectedBookingId?: string | null;
  },
): Promise<ApproveMoneyActionProposalResult> {
  const proposalId = String(params.proposalId ?? "").trim();
  if (!proposalId) {
    return { ok: false, error: "Missing proposal id.", code: "invalid_params" };
  }

  const expectedBookingId = String(params.expectedBookingId ?? "").trim();
  if (expectedBookingId) {
    const { data: pre, error: preErr } = await admin
      .from("admin_money_action_proposals")
      .select("id, booking_id, status")
      .eq("id", proposalId)
      .maybeSingle();
    if (preErr) return { ok: false, error: preErr.message, code: "proposal_load_failed" };
    if (!pre) return { ok: false, error: "Proposal not found.", code: "proposal_not_found" };
    if (String((pre as { booking_id: string }).booking_id) !== expectedBookingId) {
      return { ok: false, error: "Proposal booking mismatch.", code: "proposal_booking_mismatch" };
    }
  }

  const claim = await claimMoneyActionProposalForApprove(admin, {
    proposalId,
    actorUserId: params.actorUserId,
  });

  if (!claim.ok) {
    if (claim.alreadyApproved && claim.proposal) {
      return {
        ok: true,
        status: "approved",
        proposalId: claim.proposal.id,
        applied: true,
        alreadyProcessed: true,
        payoutId: null,
        batchTotalCents: null,
        edit_mode: String((claim.proposal.payload as { edit_mode?: string })?.edit_mode ?? "solo_owner"),
      };
    }
    return { ok: false, error: claim.error, code: claim.code };
  }

  const proposal = claim.proposal;
  if (!isEarningsAdjustActionType(String(proposal.action_type))) {
    await markProposalTerminal(admin, {
      proposalId: proposal.id,
      status: "failed",
      actorUserId: params.actorUserId,
      reviewNote: `Unsupported action_type for this approve path: ${proposal.action_type}`,
    });
    return {
      ok: false,
      error: "This proposal type cannot be approved via earnings approve.",
      code: "proposal_action_mismatch",
    };
  }

  const parsed = parseEarningsAdjustPayload(proposal.payload);
  if (!parsed.ok) {
    await markProposalTerminal(admin, {
      proposalId: proposal.id,
      status: "failed",
      actorUserId: params.actorUserId,
      reviewNote: parsed.error,
    });
    return { ok: false, error: parsed.error, code: parsed.code };
  }

  const { data: booking, error: bookingErr } = await admin
    .from("bookings")
    .select("id")
    .eq("id", proposal.booking_id)
    .maybeSingle();
  if (bookingErr) {
    await markProposalTerminal(admin, {
      proposalId: proposal.id,
      status: "failed",
      actorUserId: params.actorUserId,
      reviewNote: bookingErr.message,
    });
    return { ok: false, error: bookingErr.message, code: "booking_load_failed" };
  }
  if (!booking) {
    await markProposalTerminal(admin, {
      proposalId: proposal.id,
      status: "failed",
      actorUserId: params.actorUserId,
      reviewNote: "Referenced booking missing.",
    });
    return { ok: false, error: "Booking not found for proposal.", code: "booking_not_found" };
  }

  const payload = parsed.payload;
  const apply = await adjustVisitPayoutEarnings(admin, {
    bookingId: proposal.booking_id,
    cleanerId: payload.cleaner_id,
    payoutCents: payload.payout_cents,
    bonusCents: payload.bonus_cents,
    adjustmentNote: payload.adjustment_note,
    adminUserId: params.actorUserId,
  });

  if (!apply.ok) {
    // Fail-closed: do not return to pending after claim (mutation may be partial).
    await markProposalTerminal(admin, {
      proposalId: proposal.id,
      status: "failed",
      actorUserId: params.actorUserId,
      reviewNote: `Apply failed: ${apply.error}`,
    });
    void logPayoutAuditEvent(admin, {
      eventType: "visit_earnings_adjusted",
      actorUserId: params.actorUserId,
      actorEmail: params.actorEmail ?? null,
      bookingIds: [proposal.booking_id],
      amountCents: payload.payout_cents + payload.bonus_cents,
      context: {
        proposal_id: proposal.id,
        approve_failed: true,
        error: apply.error,
        code: apply.code ?? null,
      },
    });
    return { ok: false, error: apply.error, code: apply.code ?? "apply_failed" };
  }

  const terminal = await markProposalTerminal(admin, {
    proposalId: proposal.id,
    status: "approved",
    actorUserId: params.actorUserId,
  });
  if (!terminal.ok) {
    // Mutation + audit already succeeded inside adjustVisitPayoutEarnings; surface terminal failure.
    return { ok: false, error: terminal.error, code: terminal.code };
  }

  return {
    ok: true,
    status: "approved",
    proposalId: proposal.id,
    applied: true,
    payoutId: apply.payoutId,
    batchTotalCents: apply.batchTotalCents,
    edit_mode: apply.mode,
  };
}
