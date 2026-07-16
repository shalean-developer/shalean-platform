import "server-only";

/**
 * Booking refund maker–checker stored in booking_snapshot (no schema migration).
 * Enabled when REFUND_MAKER_CHECKER=true, else follows PAYOUT_MAKER_CHECKER.
 */

export function refundMakerCheckerEnabled(): boolean {
  const explicit = String(process.env.REFUND_MAKER_CHECKER ?? "")
    .trim()
    .toLowerCase();
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  return (
    String(process.env.PAYOUT_MAKER_CHECKER ?? "")
      .trim()
      .toLowerCase() === "true"
  );
}

export function refundAllowSelfApprove(): boolean {
  return (
    String(process.env.REFUND_ALLOW_SELF_APPROVE ?? process.env.PAYOUT_ALLOW_SELF_APPROVE ?? "")
      .trim()
      .toLowerCase() === "true"
  );
}

export type RefundMakerCheckerGate =
  | { ok: true; mode: "direct" }
  | { ok: true; mode: "propose" }
  | { ok: true; mode: "approve"; proposalId: string }
  | {
      ok: false;
      error: string;
      code:
        | "maker_checker_self_approve"
        | "proposal_not_found"
        | "proposal_expired"
        | "proposal_mismatch"
        | "proposal_required";
    };

export function evaluateRefundMakerChecker(params: {
  enabled: boolean;
  adminUserId: string;
  proposalId?: string | null;
  pendingProposal: {
    id: string;
    proposed_by: string;
    expires_at: string;
    amount_cents: number | null;
  } | null;
  requestedAmountCents: number | null;
}): RefundMakerCheckerGate {
  if (!params.enabled) return { ok: true, mode: "direct" };

  const proposalId = typeof params.proposalId === "string" ? params.proposalId.trim() : "";

  if (!proposalId) {
    return { ok: true, mode: "propose" };
  }

  if (!params.pendingProposal || params.pendingProposal.id !== proposalId) {
    return { ok: false, error: "Refund proposal not found.", code: "proposal_not_found" };
  }

  if (new Date(params.pendingProposal.expires_at).getTime() <= Date.now()) {
    return { ok: false, error: "Refund proposal expired.", code: "proposal_expired" };
  }

  if (
    params.pendingProposal.amount_cents != null &&
    params.requestedAmountCents != null &&
    Math.round(params.pendingProposal.amount_cents) !== Math.round(params.requestedAmountCents)
  ) {
    return { ok: false, error: "Refund proposal amount mismatch.", code: "proposal_mismatch" };
  }

  if (
    !refundAllowSelfApprove() &&
    String(params.pendingProposal.proposed_by) === params.adminUserId
  ) {
    return {
      ok: false,
      error: "Maker–checker: the admin who requested this refund cannot also approve it.",
      code: "maker_checker_self_approve",
    };
  }

  return { ok: true, mode: "approve", proposalId };
}
