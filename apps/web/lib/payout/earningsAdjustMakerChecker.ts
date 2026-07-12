import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type MoneyActionType =
  | "adjust_payout_earnings"
  | "adjust_team_payout_earnings"
  | "reprice_booking_details";

function payoutMakerCheckerEnabled(): boolean {
  return String(process.env.PAYOUT_MAKER_CHECKER ?? "")
    .trim()
    .toLowerCase() === "true";
}

function repriceMakerCheckerEnabled(): boolean {
  const explicit = String(process.env.BOOKING_REPRICE_MAKER_CHECKER ?? "")
    .trim()
    .toLowerCase();
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  // Default: follow PAYOUT_MAKER_CHECKER so one ops switch covers money mutations.
  return payoutMakerCheckerEnabled();
}

function makerCheckerEnabledFor(actionType: MoneyActionType): boolean {
  if (actionType === "reprice_booking_details") return repriceMakerCheckerEnabled();
  return payoutMakerCheckerEnabled();
}

function allowSelfApprove(): boolean {
  return String(process.env.PAYOUT_ALLOW_SELF_APPROVE ?? "")
    .trim()
    .toLowerCase() === "true";
}

export type MoneyActionProposalResult =
  | { ok: true; mode: "proposed"; proposalId: string }
  | { ok: true; mode: "applied"; proposalId?: string }
  | { ok: false; error: string; code?: string };

/**
 * Maker–checker for money-affecting admin actions.
 * When enabled for the action type:
 * - First call (no proposalId) inserts a pending proposal and returns without applying.
 * - Second call with proposalId by a different admin applies via `apply()`.
 * When disabled, `apply()` runs immediately.
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
    if (error) return { ok: false, error: error.message, code: "proposal_create_failed" };
    return { ok: true, mode: "proposed", proposalId: String((data as { id: string }).id) };
  }

  const { data: proposal, error: loadErr } = await admin
    .from("admin_money_action_proposals")
    .select("id, booking_id, proposed_by, status, expires_at, payload, action_type")
    .eq("id", proposalId)
    .maybeSingle();
  if (loadErr) return { ok: false, error: loadErr.message, code: "proposal_load_failed" };
  if (!proposal) return { ok: false, error: "Proposal not found.", code: "proposal_not_found" };

  const row = proposal as {
    id: string;
    booking_id: string;
    proposed_by: string;
    status: string;
    expires_at: string;
    action_type: string;
  };

  if (row.booking_id !== params.bookingId) {
    return { ok: false, error: "Proposal booking mismatch.", code: "proposal_booking_mismatch" };
  }
  if (row.action_type !== params.actionType) {
    return { ok: false, error: "Proposal action mismatch.", code: "proposal_action_mismatch" };
  }
  if (String(row.status).toLowerCase() !== "pending") {
    return { ok: false, error: "Proposal is not pending.", code: "proposal_not_pending" };
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await admin
      .from("admin_money_action_proposals")
      .update({ status: "expired" })
      .eq("id", row.id);
    return { ok: false, error: "Proposal expired.", code: "proposal_expired" };
  }

  if (!allowSelfApprove() && String(row.proposed_by) === params.adminUserId) {
    return {
      ok: false,
      error: "Maker–checker: the admin who proposed this adjustment cannot also approve it.",
      code: "maker_checker_self_approve",
    };
  }

  const applied = await params.apply();
  if (!applied.ok) return { ok: false, error: applied.error, code: applied.code };

  await admin
    .from("admin_money_action_proposals")
    .update({
      status: "approved",
      reviewed_by: params.adminUserId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", row.id);

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
