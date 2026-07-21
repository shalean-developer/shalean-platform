import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  rejectMoneyActionProposalAtomic,
  visitEarningsRejectAuditReference,
} from "@/lib/payout/claimMoneyActionProposal";
import { parseEarningsAdjustPayload } from "@/lib/payout/moneyActionProposalPayload";
import { logPayoutAuditEvent } from "@/lib/payout/payoutAudit";

export type RejectMoneyActionProposalResult =
  | {
      ok: true;
      status: "rejected";
      proposalId: string;
      applied: false;
      alreadyProcessed?: boolean;
      transitionApplied?: boolean;
    }
  | { ok: false; error: string; code: string };

/**
 * Reject a pending earnings proposal. Never mutates cleaner earnings.
 *
 * KI-OPS-003: write visit_earnings_adjustment_rejected only when this request
 * wins the atomic pending→rejected transition (`transitionApplied === true`).
 * Idempotent / concurrent losers return already_processed without a second audit.
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
  const transitionApplied = rejected.transitionApplied === true;

  // Already-processed / concurrent loser: do not insert another reject audit,
  // do not overwrite checker / note / reviewed_at (RPC already skipped UPDATE).
  if (!transitionApplied) {
    return {
      ok: true,
      status: "rejected",
      proposalId: proposal.id,
      applied: false,
      alreadyProcessed: true,
      transitionApplied: false,
    };
  }

  const parsed = parseEarningsAdjustPayload(proposal.payload);
  const amountCents = parsed.ok
    ? parsed.payload.payout_cents + parsed.payload.bonus_cents
    : null;

  // Fail-closed audit for the winning rejection only (no earnings mutation).
  // Deterministic reference + DB unique index enforce exactly-one under races.
  const { error: auditErr } = await admin.from("payout_audit_events").insert({
    event_type: "visit_earnings_adjustment_rejected",
    actor_user_id: params.actorUserId,
    actor_email: params.actorEmail ?? null,
    booking_ids: [proposal.booking_id],
    amount_cents: amountCents,
    reference: visitEarningsRejectAuditReference(proposal.id),
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
      review_note: proposal.review_note ?? note,
      action_type: proposal.action_type,
      transition_applied: true,
    },
  });

  if (auditErr) {
    // Unique violation (23505) means another winner path already wrote the audit —
    // still a successful exactly-once outcome.
    const isUnique =
      auditErr.code === "23505" ||
      /duplicate key|unique constraint/i.test(auditErr.message ?? "");
    if (!isUnique) {
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
  }

  return {
    ok: true,
    status: "rejected",
    proposalId: proposal.id,
    applied: false,
    alreadyProcessed: false,
    transitionApplied: true,
  };
}
