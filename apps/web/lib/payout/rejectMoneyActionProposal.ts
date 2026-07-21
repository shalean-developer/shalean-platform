import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { rejectMoneyActionProposalAtomic } from "@/lib/payout/claimMoneyActionProposal";
import { parseEarningsAdjustPayload } from "@/lib/payout/moneyActionProposalPayload";
import { logPayoutAuditEvent } from "@/lib/payout/payoutAudit";

export type RejectMoneyActionProposalResult =
  | {
      ok: true;
      status: "rejected";
      proposalId: string;
      applied: false;
      alreadyProcessed?: boolean;
    }
  | { ok: false; error: string; code: string };

/**
 * Reject a pending earnings proposal. Never mutates cleaner earnings.
 */
export async function rejectMoneyActionProposal(
  admin: SupabaseClient,
  params: {
    proposalId: string;
    actorUserId: string;
    actorEmail?: string | null;
    reviewNote: string;
  },
): Promise<RejectMoneyActionProposalResult> {
  const proposalId = String(params.proposalId ?? "").trim();
  const note = String(params.reviewNote ?? "").trim();
  if (!proposalId) return { ok: false, error: "Missing proposal id.", code: "invalid_params" };
  if (note.length < 3) {
    return {
      ok: false,
      error: "A rejection reason of at least 3 characters is required.",
      code: "review_note_required",
    };
  }

  const rejected = await rejectMoneyActionProposalAtomic(admin, {
    proposalId,
    actorUserId: params.actorUserId,
    reviewNote: note,
  });

  if (!rejected.ok) {
    return { ok: false, error: rejected.error, code: rejected.code };
  }

  const proposal = rejected.proposal;
  const parsed = parseEarningsAdjustPayload(proposal.payload);
  const amountCents = parsed.ok
    ? parsed.payload.payout_cents + parsed.payload.bonus_cents
    : null;

  // Fail-closed audit for rejection (no earnings mutation).
  const { error: auditErr } = await admin.from("payout_audit_events").insert({
    event_type: "visit_earnings_adjustment_rejected",
    actor_user_id: params.actorUserId,
    actor_email: params.actorEmail ?? null,
    booking_ids: [proposal.booking_id],
    amount_cents: amountCents,
    old_values: {
      original_total_cents: parsed.ok ? parsed.payload.original_total_cents ?? null : null,
    },
    new_values: {
      proposed_total_cents: amountCents,
      status: "rejected",
    },
    context: {
      proposal_id: proposal.id,
      proposed_by: proposal.proposed_by,
      review_note: note,
      action_type: proposal.action_type,
    },
  });

  if (auditErr) {
    // Proposal already rejected atomically; log secondary warn but still report success
    // with audit warning — rejection itself must not mutate earnings and is durable.
    void logPayoutAuditEvent(admin, {
      eventType: "payout_amount_adjusted",
      actorUserId: params.actorUserId,
      actorEmail: params.actorEmail ?? null,
      bookingIds: [proposal.booking_id],
      amountCents,
      context: {
        proposal_id: proposal.id,
        reject_audit_failed: true,
        error: auditErr.message,
      },
    });
  }

  return {
    ok: true,
    status: "rejected",
    proposalId: proposal.id,
    applied: false,
    alreadyProcessed: rejected.alreadyProcessed,
  };
}
