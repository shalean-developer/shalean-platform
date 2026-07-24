export type MoneyActionType =
  | "adjust_payout_earnings"
  | "adjust_team_payout_earnings"
  | "reprice_booking_details";

export type MoneyActionProposalStatus =
  | "pending"
  | "processing"
  | "approved"
  | "rejected"
  | "expired"
  | "failed";

export type EarningsAdjustProposalPayload = {
  payout_cents: number;
  bonus_cents: number;
  cleaner_id: string | null;
  adjustment_note: string | null;
  edit_mode: "solo_owner" | "per_cleaner" | string;
  original_payout_cents?: number | null;
  original_bonus_cents?: number | null;
  original_total_cents?: number | null;
  snapshot_at?: string | null;
};

export type MoneyActionProposalRow = {
  id: string;
  action_type: MoneyActionType | string;
  booking_id: string;
  payload: Record<string, unknown>;
  proposed_by: string;
  proposed_by_email: string | null;
  status: MoneyActionProposalStatus | string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  expires_at: string;
};

export const EARNINGS_ADJUST_ACTION_TYPES = [
  "adjust_payout_earnings",
  "adjust_team_payout_earnings",
] as const;

export function isEarningsAdjustActionType(actionType: string): boolean {
  return (
    actionType === "adjust_payout_earnings" || actionType === "adjust_team_payout_earnings"
  );
}

export function payoutMakerCheckerEnabled(): boolean {
  return (
    String(process.env.PAYOUT_MAKER_CHECKER ?? "")
      .trim()
      .toLowerCase() === "true"
  );
}

export function allowSelfApproveMoneyAction(): boolean {
  return (
    String(process.env.PAYOUT_ALLOW_SELF_APPROVE ?? "")
      .trim()
      .toLowerCase() === "true"
  );
}

/** Why Approve/Reject are hidden — computed server-side; do not infer from can_review alone. */
export type MoneyActionProposalReviewBlockReason =
  | "self_proposal"
  | "expired"
  | "not_pending"
  | null;

/** Shared list DTO for Office Approvals (safe for client imports). */
export type MoneyActionProposalListItem = {
  id: string;
  action_type: string;
  status: string;
  booking_id: string;
  booking: {
    date: string | null;
    customer_name: string | null;
    service: string | null;
  };
  cleaner_id: string | null;
  cleaner_name: string | null;
  original_total_cents: number | null;
  proposed_payout_cents: number | null;
  proposed_bonus_cents: number | null;
  proposed_total_cents: number | null;
  difference_cents: number | null;
  adjustment_note: string | null;
  proposed_by: string;
  proposed_by_email: string | null;
  created_at: string;
  expires_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  can_review: boolean;
  review_block_reason: MoneyActionProposalReviewBlockReason;
};
