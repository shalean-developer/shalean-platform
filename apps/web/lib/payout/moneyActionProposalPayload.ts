import "server-only";

import type { EarningsAdjustProposalPayload } from "@/lib/payout/moneyActionProposalTypes";

export function parseEarningsAdjustPayload(
  raw: unknown,
):
  | { ok: true; payload: EarningsAdjustProposalPayload }
  | { ok: false; error: string; code: "malformed_payload" } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Proposal payload is missing or invalid.", code: "malformed_payload" };
  }
  const p = raw as Record<string, unknown>;
  const payoutCents = Number(p.payout_cents);
  const bonusCents = p.bonus_cents == null ? 0 : Number(p.bonus_cents);
  if (!Number.isFinite(payoutCents) || payoutCents < 0 || !Number.isInteger(Math.round(payoutCents))) {
    return { ok: false, error: "payload.payout_cents is invalid.", code: "malformed_payload" };
  }
  if (!Number.isFinite(bonusCents) || bonusCents < 0 || !Number.isInteger(Math.round(bonusCents))) {
    return { ok: false, error: "payload.bonus_cents is invalid.", code: "malformed_payload" };
  }
  const cleanerRaw = p.cleaner_id;
  const cleanerId =
    cleanerRaw == null || cleanerRaw === ""
      ? null
      : typeof cleanerRaw === "string"
        ? cleanerRaw.trim() || null
        : null;
  if (cleanerRaw != null && cleanerRaw !== "" && cleanerId == null) {
    return { ok: false, error: "payload.cleaner_id is invalid.", code: "malformed_payload" };
  }

  const note =
    p.adjustment_note == null
      ? null
      : typeof p.adjustment_note === "string"
        ? p.adjustment_note
        : null;

  const editMode =
    typeof p.edit_mode === "string" && p.edit_mode.trim()
      ? p.edit_mode.trim()
      : cleanerId
        ? "per_cleaner"
        : "solo_owner";

  const optionalCents = (v: unknown): number | null => {
    if (v == null) return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n);
  };

  return {
    ok: true,
    payload: {
      payout_cents: Math.round(payoutCents),
      bonus_cents: Math.round(bonusCents),
      cleaner_id: cleanerId,
      adjustment_note: note,
      edit_mode: editMode,
      original_payout_cents: optionalCents(p.original_payout_cents),
      original_bonus_cents: optionalCents(p.original_bonus_cents),
      original_total_cents: optionalCents(p.original_total_cents),
      snapshot_at: typeof p.snapshot_at === "string" ? p.snapshot_at : null,
    },
  };
}

export function buildEarningsAdjustProposePayload(params: {
  payoutCents: number;
  bonusCents: number;
  cleanerId: string | null;
  adjustmentNote: string | null;
  editMode: string;
  originalPayoutCents?: number | null;
  originalBonusCents?: number | null;
  originalTotalCents?: number | null;
}): EarningsAdjustProposalPayload {
  return {
    payout_cents: Math.round(params.payoutCents),
    bonus_cents: Math.round(params.bonusCents),
    cleaner_id: params.cleanerId,
    adjustment_note: params.adjustmentNote,
    edit_mode: params.editMode,
    original_payout_cents: params.originalPayoutCents ?? null,
    original_bonus_cents: params.originalBonusCents ?? null,
    original_total_cents: params.originalTotalCents ?? null,
    snapshot_at: new Date().toISOString(),
  };
}
