import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { ensurePaystackRecipient } from "@/lib/payout/ensurePaystackRecipient";
import { measurePhase15aLedgerClaimShadowEligibility } from "@/lib/payout/phase15aLedgerClaimShadowEligibility";
import { logPayoutAuditEvent } from "@/lib/payout/payoutAudit";
import {
  immutableEarningsDisbursementReference,
  submitPaystackTransferViaOutbox,
} from "@/lib/payout/paystackTransferExecutor";

async function revertClaimedDisbursement(admin: SupabaseClient, disbursementId: string, errorNote: string): Promise<void> {
  const now = new Date().toISOString();
  await admin
    .from("cleaner_earnings")
    .update({ status: "approved", disbursement_id: null })
    .eq("disbursement_id", disbursementId)
    .eq("status", "processing");
  await admin
    .from("cleaner_earnings_disbursements")
    .update({ status: "failed", updated_at: now })
    .eq("id", disbursementId)
    .eq("status", "processing");
  void reportOperationalIssue("warn", "executeCleanerApprovedEarningsPaystack", errorNote, { disbursementId });
}

/**
 * Claims all eligible `approved` `cleaner_earnings` for the cleaner (DB lock + dual-rail gate),
 * then sends one Paystack transfer via the shared outbox executor.
 * Completion is driven by `transfer.success` webhook.
 */
export async function executeCleanerApprovedEarningsPaystack(
  admin: SupabaseClient,
  params: { cleanerId: string; initiatedBy?: string | null },
): Promise<
  | {
      ok: true;
      disbursement_id: string;
      transferCode: string | null;
      reference: string;
      skipped?: boolean;
      needsReconcile?: boolean;
    }
  | { ok: false; error: string; code?: string; status?: number; needsReconcile?: boolean }
> {
  const cid = params.cleanerId.trim();
  if (!/^[0-9a-f-]{36}$/i.test(cid)) return { ok: false, error: "Invalid cleaner id", status: 400 };

  const ensured = await ensurePaystackRecipient(admin, cid);
  if (!ensured.ok) {
    return { ok: false, error: ensured.error, status: 400 };
  }

  /**
   * Phase 15A measurement + Phase 3 I3 soft gate (app layer).
   * Dual-rail exclusion is also enforced in `claim_cleaner_earnings_for_paystack` (20261065).
   */
  await measurePhase15aLedgerClaimShadowEligibility(admin, cid);

  const { assertLedgerClaimNotOnWeeklyRail } = await import(
    "@/lib/payout/assertLedgerClaimNotOnWeeklyRail"
  );
  const dualRail = await assertLedgerClaimNotOnWeeklyRail(admin, cid);
  if (!dualRail.ok) {
    return { ok: false, error: dualRail.error, code: dualRail.code, status: 409 };
  }

  void logPayoutAuditEvent(admin, {
    eventType: "ledger_disburse_requested",
    actorUserId: params.initiatedBy,
    context: { cleanerId: cid },
  });

  const { data: disbIdRaw, error: claimErr } = await admin.rpc("claim_cleaner_earnings_for_paystack", {
    p_cleaner_id: cid,
  });
  if (claimErr) {
    const msg = claimErr.message || String(claimErr);
    if (/no_approved_earnings/i.test(msg)) {
      return { ok: false, error: "No approved earnings to pay out.", code: "no_approved_earnings", status: 400 };
    }
    return { ok: false, error: msg };
  }

  const disbursementId = String(disbIdRaw ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(disbursementId)) {
    return { ok: false, error: "Claim RPC returned invalid disbursement id." };
  }

  const { data: existingOk } = await admin
    .from("earnings_disbursement_transfers")
    .select("id, transfer_code, reference")
    .eq("disbursement_id", disbursementId)
    .eq("status", "success")
    .maybeSingle();
  if (existingOk && typeof existingOk.id === "string") {
    const tc = String(existingOk.transfer_code ?? "").trim();
    const ref = String(existingOk.reference ?? "").trim();
    return {
      ok: true,
      disbursement_id: disbursementId,
      transferCode: tc || null,
      reference: ref || tc || immutableEarningsDisbursementReference(disbursementId),
      skipped: true,
    };
  }

  const { data: disb, error: dErr } = await admin
    .from("cleaner_earnings_disbursements")
    .select("id, cleaner_id, total_amount_cents, status")
    .eq("id", disbursementId)
    .maybeSingle();
  if (dErr || !disb) {
    await revertClaimedDisbursement(admin, disbursementId, "Disbursement row missing after claim");
    return { ok: false, error: dErr?.message ?? "Disbursement not found." };
  }
  const row = disb as { cleaner_id?: string; total_amount_cents?: number; status?: string };
  if (String(row.cleaner_id ?? "").trim() !== cid) {
    await revertClaimedDisbursement(admin, disbursementId, "cleaner_id mismatch on disbursement");
    return { ok: false, error: "Disbursement cleaner mismatch.", status: 500 };
  }
  const amount = Math.max(0, Math.round(Number(row.total_amount_cents) || 0));
  if (amount <= 0) {
    await revertClaimedDisbursement(admin, disbursementId, "zero amount disbursement");
    return { ok: false, error: "Disbursement amount is zero.", status: 400 };
  }

  const reference = immutableEarningsDisbursementReference(disbursementId);
  const transfer = await submitPaystackTransferViaOutbox(admin, {
    rail: "cleaner_earnings",
    subjectId: disbursementId,
    cleanerId: cid,
    amountCents: amount,
    recipientCode: ensured.recipientCode,
    reference,
    initiatedBy: params.initiatedBy,
  });

  if (!transfer.ok) {
    if (transfer.needsReconcile) {
      // Do not revert claim — money may have moved; leave processing for webhook/reconcile.
      void reportOperationalIssue("warn", "executeCleanerApprovedEarningsPaystack", transfer.error, {
        disbursementId,
        needsReconcile: true,
      });
      return {
        ok: false,
        error: transfer.error,
        needsReconcile: true,
      };
    }
    await revertClaimedDisbursement(admin, disbursementId, transfer.error);
    return { ok: false, error: transfer.error };
  }

  const now = new Date().toISOString();
  const { error: upDisbErr } = await admin
    .from("cleaner_earnings_disbursements")
    .update({
      paystack_reference: transfer.reference,
      transfer_code: transfer.transferCode,
      updated_at: now,
    })
    .eq("id", disbursementId)
    .eq("status", "processing");
  if (upDisbErr) {
    void reportOperationalIssue("error", "executeCleanerApprovedEarningsPaystack", upDisbErr.message, {
      disbursementId,
    });
  }

  void logSystemEvent({
    level: "info",
    source: "EARNINGS_PAYSTACK_PROCESSING",
    message: "Cleaner earnings transfer sent; awaiting webhook",
    context: {
      disbursementId,
      cleanerId: cid,
      initiatedBy: params.initiatedBy ?? null,
      transferCode: transfer.transferCode,
      reference: transfer.reference,
    },
  });

  return {
    ok: true,
    disbursement_id: disbursementId,
    transferCode: transfer.transferCode,
    reference: transfer.reference,
    skipped: transfer.skippedExisting,
    needsReconcile: transfer.needsReconcile,
  };
}

/**
 * Runs {@link executeCleanerApprovedEarningsPaystack} for each cleaner that has at least one approved ledger row.
 */
export async function executeAllCleanersApprovedEarningsPaystack(
  admin: SupabaseClient,
  params: { initiatedBy?: string | null },
): Promise<{
  cleaners: number;
  results: { cleaner_id: string; ok: boolean; error?: string; disbursement_id?: string }[];
}> {
  const { data: idsRows, error } = await admin
    .from("cleaner_earnings")
    .select("cleaner_id")
    .eq("status", "approved")
    .is("disbursement_id", null);
  if (error) {
    void reportOperationalIssue("error", "executeAllCleanersApprovedEarningsPaystack", error.message, {});
    return { cleaners: 0, results: [] };
  }
  const ids = [
    ...new Set(
      (idsRows ?? [])
        .map((r) => String((r as { cleaner_id?: string }).cleaner_id ?? "").trim())
        .filter(Boolean),
    ),
  ];
  const results: { cleaner_id: string; ok: boolean; error?: string; disbursement_id?: string }[] = [];
  for (const cleaner_id of ids) {
    const r = await executeCleanerApprovedEarningsPaystack(admin, {
      cleanerId: cleaner_id,
      initiatedBy: params.initiatedBy,
    });
    if (r.ok) {
      results.push({ cleaner_id, ok: true, disbursement_id: r.disbursement_id });
    } else if (r.code === "no_approved_earnings") {
      results.push({ cleaner_id, ok: true });
    } else {
      results.push({ cleaner_id, ok: false, error: r.error });
    }
  }
  return { cleaners: ids.length, results };
}
