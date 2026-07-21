import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { allowSelfApproveMoneyAction, type MoneyActionProposalRow } from "@/lib/payout/moneyActionProposalTypes";

type ClaimRpcResult = {
  claimed?: boolean;
  code?: string;
  status?: string;
  proposal?: MoneyActionProposalRow;
};

export type ClaimMoneyActionProposalResult =
  | { ok: true; proposal: MoneyActionProposalRow; alreadyApproved?: false }
  | {
      ok: false;
      error: string;
      code: string;
      proposal?: MoneyActionProposalRow;
      alreadyApproved?: boolean;
    };

function mapClaimCode(code: string): { error: string; httpHint?: number } {
  switch (code) {
    case "maker_checker_self_approve":
      return {
        error: "Maker–checker: the admin who proposed this adjustment cannot also approve it.",
      };
    case "proposal_not_found":
      return { error: "Proposal not found." };
    case "proposal_expired":
      return { error: "Proposal expired." };
    case "proposal_already_approved":
      return { error: "Proposal already approved." };
    case "proposal_already_rejected":
      return { error: "Proposal already rejected." };
    case "proposal_failed":
      return { error: "Proposal previously failed during apply." };
    case "proposal_not_pending":
      return { error: "Proposal is not pending." };
    case "invalid_params":
      return { error: "Invalid claim parameters." };
    default:
      return { error: `Claim failed (${code}).` };
  }
}

/**
 * Atomically claim a pending proposal (pending → processing) via SECURITY DEFINER RPC.
 */
export async function claimMoneyActionProposalForApprove(
  admin: SupabaseClient,
  params: { proposalId: string; actorUserId: string },
): Promise<ClaimMoneyActionProposalResult> {
  const { data, error } = await admin.rpc("claim_admin_money_action_proposal", {
    p_proposal_id: params.proposalId,
    p_actor_id: params.actorUserId,
    p_allow_self: allowSelfApproveMoneyAction(),
  });

  if (error) {
    return { ok: false, error: error.message, code: "proposal_claim_failed" };
  }

  const raw = (data ?? {}) as ClaimRpcResult;
  if (raw.claimed === true && raw.proposal) {
    return { ok: true, proposal: raw.proposal as MoneyActionProposalRow };
  }

  const code = String(raw.code ?? "proposal_not_pending");
  if (code === "proposal_already_approved" && raw.proposal) {
    return {
      ok: false,
      error: mapClaimCode(code).error,
      code,
      proposal: raw.proposal as MoneyActionProposalRow,
      alreadyApproved: true,
    };
  }

  return { ok: false, error: mapClaimCode(code).error, code };
}

type RejectRpcResult = {
  ok?: boolean;
  code?: string;
  status?: string;
  already_processed?: boolean;
  proposal?: MoneyActionProposalRow;
};

export type RejectMoneyActionProposalRpcResult =
  | { ok: true; proposal: MoneyActionProposalRow; alreadyProcessed?: boolean }
  | { ok: false; error: string; code: string };

export async function rejectMoneyActionProposalAtomic(
  admin: SupabaseClient,
  params: { proposalId: string; actorUserId: string; reviewNote: string },
): Promise<RejectMoneyActionProposalRpcResult> {
  const { data, error } = await admin.rpc("reject_admin_money_action_proposal", {
    p_proposal_id: params.proposalId,
    p_actor_id: params.actorUserId,
    p_review_note: params.reviewNote,
    p_allow_self: allowSelfApproveMoneyAction(),
  });

  if (error) {
    return { ok: false, error: error.message, code: "proposal_reject_failed" };
  }

  const raw = (data ?? {}) as RejectRpcResult;
  if (raw.ok === true && raw.proposal) {
    return {
      ok: true,
      proposal: raw.proposal as MoneyActionProposalRow,
      alreadyProcessed: raw.already_processed === true || raw.code === "already_rejected",
    };
  }

  const code = String(raw.code ?? "proposal_not_pending");
  const mapped = mapClaimCode(code);
  if (code === "review_note_required") {
    return { ok: false, error: "A rejection reason of at least 3 characters is required.", code };
  }
  return { ok: false, error: mapped.error, code };
}
