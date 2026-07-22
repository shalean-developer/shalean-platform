import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { approveMoneyActionProposal } from "@/lib/payout/approveMoneyActionProposal";
import {
  allowSelfApproveMoneyAction,
  payoutMakerCheckerEnabled,
  type MoneyActionType,
} from "@/lib/payout/moneyActionProposalTypes";

export type { MoneyActionType } from "@/lib/payout/moneyActionProposalTypes";

function repriceMakerCheckerEnabled(): boolean {
  const explicit = String(process.env.BOOKING_REPRICE_MAKER_CHECKER ?? "")
    .trim()
    .toLowerCase();
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  return payoutMakerCheckerEnabled();
}

function makerCheckerEnabledFor(actionType: MoneyActionType): boolean {
  if (actionType === "reprice_booking_details") return repriceMakerCheckerEnabled();
  return payoutMakerCheckerEnabled();
}

export type MoneyActionProposalResult =
  | { ok: true; mode: "proposed"; proposalId: string }
  | { ok: true; mode: "applied"; proposalId?: string; alreadyProcessed?: boolean }
  | { ok: false; error: string; code?: string; existingProposalId?: string };

/**
 * Maker–checker for money-affecting admin actions.
 * When enabled for the action type:
 * - First call (no proposalId) inserts a pending proposal and returns without applying.
 * - Second call with proposalId by a different admin applies via stored payload (earnings) or apply().
 * When disabled, `apply()` runs immediately.
 *
 * Earnings adjust approval always uses {@link approveMoneyActionProposal} (immutable payload + atomic claim).
 * Reprice keeps apply() but claims atomically when proposalId is provided via the same claim RPC when possible.
 */
export async function withMoneyActionMakerChecker(
  admin: SupabaseClient,
  params: {
    actionType: MoneyActionType;
    bookingId: string;
    payload: Record<string, unknown>;
    adminUserId: string;
    adminEmail?: string | null;
    proposalId?: string | null;
    /** When approving via legacy path: ignore body and use stored payload for earnings types. */
    apply: () => Promise<{ ok: true } | { ok: false; error: string; code?: string }>;
  },
): Promise<MoneyActionProposalResult> {
  if (!makerCheckerEnabledFor(params.actionType)) {
    const applied = await params.apply();
    if (!applied.ok) return { ok: false, error: applied.error, code: applied.code };
    return { ok: true, mode: "applied" };
  }

  const proposalId = typeof params.proposalId === "string" ? params.proposalId.trim() : "";

  if (!proposalId) {
    // Duplicate open proposal guard (DB unique index is authoritative; pre-check for clear UX).
    const cleanerKey =
      params.payload.cleaner_id == null || params.payload.cleaner_id === ""
        ? ""
        : String(params.payload.cleaner_id);

    const { data: existingRows } = await admin
      .from("admin_money_action_proposals")
      .select("id, status, payload")
      .eq("booking_id", params.bookingId)
      .eq("action_type", params.actionType)
      .in("status", ["pending", "processing"])
      .limit(20);

    const existing = (existingRows ?? []).find((row) => {
      const payload = (row as { payload?: { cleaner_id?: string | null } }).payload;
      const cid = payload?.cleaner_id == null || payload.cleaner_id === "" ? "" : String(payload.cleaner_id);
      return cid === cleanerKey;
    }) as { id: string } | undefined;

    if (existing?.id) {
      return {
        ok: false,
        error:
          "A pending approval already exists for this visit earnings change. Review it in Office Approvals before proposing another.",
        code: "proposal_duplicate_pending",
        existingProposalId: String(existing.id),
      };
    }

    const { data, error } = await admin
      .from("admin_money_action_proposals")
      .insert({
        action_type: params.actionType,
        booking_id: params.bookingId,
        payload: params.payload,
        proposed_by: params.adminUserId,
        proposed_by_email: params.adminEmail ?? null,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      // Unique index race
      if (/one_open_uidx|duplicate key|unique/i.test(error.message)) {
        return {
          ok: false,
          error:
            "A pending approval already exists for this visit earnings change. Review it in Office Approvals before proposing another.",
          code: "proposal_duplicate_pending",
        };
      }
      return { ok: false, error: error.message, code: "proposal_create_failed" };
    }
    return { ok: true, mode: "proposed", proposalId: String((data as { id: string }).id) };
  }

  // --- Approve path ---
  if (
    params.actionType === "adjust_payout_earnings" ||
    params.actionType === "adjust_team_payout_earnings"
  ) {
    // Immutable stored payload + atomic claim. Body financial fields must not be used.
    const approved = await approveMoneyActionProposal(admin, {
      proposalId,
      actorUserId: params.adminUserId,
      actorEmail: params.adminEmail,
      expectedBookingId: params.bookingId,
    });
    if (!approved.ok) return { ok: false, error: approved.error, code: approved.code };
    return {
      ok: true,
      mode: "applied",
      proposalId: approved.proposalId,
      alreadyProcessed: approved.alreadyProcessed,
    };
  }

  // Reprice (and other non-earnings): claim then apply request body is still used by edit-details
  // caller; claim still prevents double-apply. Self-approve blocked via claim RPC.
  const { data: claimRaw, error: claimErr } = await admin.rpc("claim_admin_money_action_proposal", {
    p_proposal_id: proposalId,
    p_actor_id: params.adminUserId,
    p_allow_self: allowSelfApproveMoneyAction(),
  });
  if (claimErr) return { ok: false, error: claimErr.message, code: "proposal_claim_failed" };

  const claim = (claimRaw ?? {}) as {
    claimed?: boolean;
    code?: string;
    proposal?: {
      id: string;
      booking_id: string;
      action_type: string;
      status: string;
      payload?: Record<string, unknown>;
    };
  };

  if (claim.code === "proposal_already_approved") {
    return { ok: true, mode: "applied", proposalId, alreadyProcessed: true };
  }
  if (!claim.claimed || !claim.proposal) {
    const code = String(claim.code ?? "proposal_not_pending");
    const error =
      code === "maker_checker_self_approve"
        ? "Maker–checker: the admin who proposed this adjustment cannot also approve it."
        : code === "proposal_expired"
          ? "Proposal expired."
          : code === "proposal_not_found"
            ? "Proposal not found."
            : "Proposal is not pending.";
    return { ok: false, error, code };
  }

  const row = claim.proposal;
  if (row.booking_id !== params.bookingId) {
    await admin
      .from("admin_money_action_proposals")
      .update({
        status: "failed",
        review_note: "Proposal booking mismatch during approve.",
        reviewed_by: params.adminUserId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("status", "processing");
    return { ok: false, error: "Proposal booking mismatch.", code: "proposal_booking_mismatch" };
  }
  if (row.action_type !== params.actionType) {
    await admin
      .from("admin_money_action_proposals")
      .update({
        status: "failed",
        review_note: "Proposal action mismatch during approve.",
        reviewed_by: params.adminUserId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("status", "processing");
    return { ok: false, error: "Proposal action mismatch.", code: "proposal_action_mismatch" };
  }

  const applied = await params.apply();
  if (!applied.ok) {
    await admin
      .from("admin_money_action_proposals")
      .update({
        status: "failed",
        review_note: `Apply failed: ${applied.error}`,
        reviewed_by: params.adminUserId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("status", "processing");
    return { ok: false, error: applied.error, code: applied.code };
  }

  const { data: finalized, error: finErr } = await admin
    .from("admin_money_action_proposals")
    .update({
      status: "approved",
      reviewed_by: params.adminUserId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("status", "processing")
    .select("id");

  if (finErr || !finalized?.length) {
    return {
      ok: false,
      error: finErr?.message ?? "Could not finalize approved proposal.",
      code: "proposal_terminal_update_failed",
    };
  }

  return { ok: true, mode: "applied", proposalId: row.id };
}

/** @deprecated Prefer {@link withMoneyActionMakerChecker} */
export async function withEarningsAdjustMakerChecker(
  admin: SupabaseClient,
  params: {
    actionType: "adjust_payout_earnings" | "adjust_team_payout_earnings";
    bookingId: string;
    payload: Record<string, unknown>;
    adminUserId: string;
    adminEmail?: string | null;
    proposalId?: string | null;
    apply: () => Promise<{ ok: true } | { ok: false; error: string; code?: string }>;
  },
): Promise<MoneyActionProposalResult> {
  return withMoneyActionMakerChecker(admin, params);
}
