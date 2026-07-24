import type { MoneyActionProposalReviewBlockReason } from "@/lib/payout/moneyActionProposalTypes";

export type MoneyActionProposalReviewabilityInput = {
  status: string;
  proposed_by: string;
  expires_at: string;
  viewerUserId: string;
  /** Injected for tests; defaults to Date.now(). */
  nowMs?: number;
};

export type MoneyActionProposalReviewability = {
  status: string;
  can_review: boolean;
  review_block_reason: MoneyActionProposalReviewBlockReason;
  is_pending: boolean;
  is_expired: boolean;
  is_self_proposal: boolean;
};

/**
 * Independently evaluate why a proposal can or cannot be reviewed.
 * Does not infer reason from can_review alone.
 *
 * Priority for block reason (never show self_proposal for expired rows):
 * 1. expired (persisted or overdue pending)
 * 2. not_pending (approved/rejected/processing/failed/…)
 * 3. self_proposal
 * 4. null when reviewable
 */
export function computeMoneyActionProposalReviewability(
  input: MoneyActionProposalReviewabilityInput,
): MoneyActionProposalReviewability {
  const nowMs = input.nowMs ?? Date.now();
  const statusRaw = String(input.status).toLowerCase();
  const isExpiredByTime = new Date(input.expires_at).getTime() <= nowMs;
  const isSelfProposal = String(input.proposed_by) === String(input.viewerUserId);
  const isPendingRaw = statusRaw === "pending";
  const effectivelyExpired = statusRaw === "expired" || (isPendingRaw && isExpiredByTime);
  const status = effectivelyExpired ? "expired" : statusRaw;
  const isPending = status === "pending";

  const canReview = isPending && !isExpiredByTime && !isSelfProposal;

  let review_block_reason: MoneyActionProposalReviewBlockReason = null;
  if (effectivelyExpired) {
    review_block_reason = "expired";
  } else if (!isPending) {
    review_block_reason = "not_pending";
  } else if (isSelfProposal) {
    review_block_reason = "self_proposal";
  }

  return {
    status,
    can_review: canReview,
    review_block_reason,
    is_pending: isPending,
    is_expired: effectivelyExpired,
    is_self_proposal: isSelfProposal,
  };
}
