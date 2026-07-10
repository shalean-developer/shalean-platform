import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getPaystackBaseUrl } from "@/lib/payout/paystackOrigin";
import { logPayoutAuditEvent } from "@/lib/payout/payoutAudit";

/**
 * Single Paystack money-send entry point for cleaner payouts.
 *
 * Outbox-first: durable transfer + outbox rows exist BEFORE calling Paystack.
 * References are immutable — retries reuse the same client reference.
 * Never marks a subject "failed" after an uncertain network error (needs_reconcile).
 */

export type PayoutTransferRail = "cleaner_payout" | "cleaner_earnings";

export type SubmitPaystackTransferParams = {
  rail: PayoutTransferRail;
  /** cleaner_payouts.id or cleaner_earnings_disbursements.id */
  subjectId: string;
  cleanerId: string;
  amountCents: number;
  recipientCode: string;
  /** Immutable Paystack client reference — never regenerate on retry. */
  reference: string;
  initiatedBy?: string | null;
};

export type SubmitPaystackTransferResult =
  | {
      ok: true;
      transferCode: string | null;
      reference: string;
      skippedExisting?: boolean;
      needsReconcile?: boolean;
      outboxId: string;
    }
  | { ok: false; error: string; status?: number; needsReconcile?: boolean };

type PaystackJson = {
  status?: boolean;
  message?: string;
  data?: {
    transfer_code?: string;
    status?: string;
    reference?: string;
  };
};

type OutboxRow = {
  id: string;
  status: string;
  transfer_code: string | null;
  transfer_row_id: string | null;
  reference: string;
  attempts: number;
};

function auditTable(rail: PayoutTransferRail): "payout_transfers" | "earnings_disbursement_transfers" {
  return rail === "cleaner_payout" ? "payout_transfers" : "earnings_disbursement_transfers";
}

function subjectColumn(rail: PayoutTransferRail): "payout_id" | "disbursement_id" {
  return rail === "cleaner_payout" ? "payout_id" : "disbursement_id";
}

/** Stable weekly-batch reference — never append timestamps. */
export function immutableCleanerPayoutReference(payoutId: string): string {
  return `shalean-cleaner-payout-${payoutId}`;
}

/** Stable ledger disbursement reference. */
export function immutableEarningsDisbursementReference(disbursementId: string): string {
  return `shalean-earnings-${disbursementId}`;
}

async function paystackPostTransfer(body: Record<string, unknown>): Promise<
  | { ok: true; json: PaystackJson }
  | { ok: false; error: string; networkError?: boolean; httpStatus?: number }
> {
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secret) return { ok: false, error: "PAYSTACK_SECRET_KEY is not configured." };

  const origin = getPaystackBaseUrl();
  let res: Response;
  try {
    res = await fetch(`${origin}/transfer`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error calling Paystack /transfer",
      networkError: true,
    };
  }

  const json = (await res.json().catch(() => ({}))) as PaystackJson;
  if (!res.ok || json.status === false) {
    return {
      ok: false,
      error: json.message ?? `Paystack request failed with ${res.status}.`,
      httpStatus: res.status,
      // 5xx / timeout-like: treat as uncertain (money may have moved)
      networkError: res.status >= 500,
    };
  }
  return { ok: true, json };
}

async function paystackGetTransferByReference(
  reference: string,
): Promise<{ ok: true; transferCode: string | null; status: string | null } | { ok: false; error: string }> {
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secret) return { ok: false, error: "PAYSTACK_SECRET_KEY is not configured." };
  const origin = getPaystackBaseUrl();
  try {
    const res = await fetch(`${origin}/transfer/verify/${encodeURIComponent(reference)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${secret}` },
    });
    const json = (await res.json().catch(() => ({}))) as PaystackJson & {
      data?: { transfer_code?: string; status?: string };
    };
    if (!res.ok || json.status === false) {
      return { ok: false, error: json.message ?? `Verify failed ${res.status}` };
    }
    return {
      ok: true,
      transferCode: json.data?.transfer_code?.trim() ?? null,
      status: String(json.data?.status ?? "").trim().toLowerCase() || null,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error verifying transfer" };
  }
}

async function loadOutboxByReference(
  admin: SupabaseClient,
  reference: string,
): Promise<OutboxRow | null> {
  const { data, error } = await admin
    .from("payout_transfer_outbox")
    .select("id, status, transfer_code, transfer_row_id, reference, attempts")
    .eq("reference", reference)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as OutboxRow | null) ?? null;
}

async function loadSuccessTransfer(
  admin: SupabaseClient,
  rail: PayoutTransferRail,
  subjectId: string,
): Promise<{ transfer_code: string | null; reference?: string | null } | null> {
  const table = auditTable(rail);
  const col = subjectColumn(rail);
  const { data, error } = await admin
    .from(table)
    .select(rail === "cleaner_payout" ? "transfer_code, reference" : "transfer_code, reference")
    .eq(col, subjectId)
    .eq("status", "success")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { transfer_code: string | null; reference?: string | null } | null) ?? null;
}

/**
 * THE single function that may call Paystack POST /transfer for cleaner payouts.
 * Callers must not fetch `/transfer` themselves.
 */
export async function submitPaystackTransferViaOutbox(
  admin: SupabaseClient,
  params: SubmitPaystackTransferParams,
): Promise<SubmitPaystackTransferResult> {
  const amount = Math.max(0, Math.round(params.amountCents));
  if (amount <= 0) return { ok: false, error: "Transfer amount must be positive.", status: 400 };
  if (!params.recipientCode.trim()) return { ok: false, error: "Missing recipient_code.", status: 400 };
  if (!params.reference.trim()) return { ok: false, error: "Missing immutable reference.", status: 400 };

  const existingSuccess = await loadSuccessTransfer(admin, params.rail, params.subjectId);
  if (existingSuccess) {
    return {
      ok: true,
      transferCode: existingSuccess.transfer_code,
      reference: existingSuccess.reference?.trim() || params.reference,
      skippedExisting: true,
      outboxId: "",
    };
  }

  let outbox = await loadOutboxByReference(admin, params.reference);

  // Already submitted — resume / verify, never create a second Paystack transfer.
  if (outbox && (outbox.status === "submitted" || outbox.status === "needs_reconcile" || outbox.status === "succeeded")) {
    if (outbox.status === "succeeded" || outbox.transfer_code) {
      return {
        ok: true,
        transferCode: outbox.transfer_code,
        reference: params.reference,
        skippedExisting: true,
        outboxId: outbox.id,
      };
    }
    const verified = await paystackGetTransferByReference(params.reference);
    if (verified.ok && verified.transferCode) {
      await admin
        .from("payout_transfer_outbox")
        .update({
          status: verified.status === "success" || verified.status === "successful" ? "succeeded" : "submitted",
          transfer_code: verified.transferCode,
          updated_at: new Date().toISOString(),
        })
        .eq("id", outbox.id);
      return {
        ok: true,
        transferCode: verified.transferCode,
        reference: params.reference,
        skippedExisting: true,
        outboxId: outbox.id,
        needsReconcile: verified.status !== "success" && verified.status !== "successful",
      };
    }
    return {
      ok: true,
      transferCode: null,
      reference: params.reference,
      outboxId: outbox.id,
      needsReconcile: true,
    };
  }

  // Failed outbox: reuse same reference — reset to pending for retry (Paystack idempotent on reference).
  if (outbox && outbox.status === "failed") {
    await admin
      .from("payout_transfer_outbox")
      .update({ status: "pending", last_error: null, updated_at: new Date().toISOString() })
      .eq("id", outbox.id)
      .eq("status", "failed");
    outbox = await loadOutboxByReference(admin, params.reference);
  }

  if (!outbox) {
    const table = auditTable(params.rail);
    const col = subjectColumn(params.rail);
    const transferInsert: Record<string, unknown> = {
      [col]: params.subjectId,
      cleaner_id: params.cleanerId,
      amount_cents: amount,
      recipient_code: params.recipientCode,
      reference: params.reference,
      status: "processing",
    };

    const { data: transferRow, error: transferErr } = await admin
      .from(table)
      .insert(transferInsert)
      .select("id")
      .maybeSingle();

    if (transferErr) {
      // Unique reference race — load existing outbox/transfer and resume.
      const raced = await loadOutboxByReference(admin, params.reference);
      if (raced) {
        return submitPaystackTransferViaOutbox(admin, params);
      }
      return { ok: false, error: transferErr.message };
    }

    const transferRowId = String((transferRow as { id?: string } | null)?.id ?? "");
    const { data: outboxIns, error: outboxErr } = await admin
      .from("payout_transfer_outbox")
      .insert({
        rail: params.rail,
        subject_id: params.subjectId,
        cleaner_id: params.cleanerId,
        amount_cents: amount,
        recipient_code: params.recipientCode,
        reference: params.reference,
        transfer_row_id: transferRowId || null,
        status: "pending",
      })
      .select("id, status, transfer_code, transfer_row_id, reference, attempts")
      .maybeSingle();

    if (outboxErr) {
      // If outbox insert fails after transfer row, leave transfer processing and reconcile later.
      void logSystemEvent({
        level: "error",
        source: "PAYSTACK_OUTBOX_ENQUEUE",
        message: "Transfer audit inserted but outbox insert failed",
        context: { reference: params.reference, error: outboxErr.message, transferRowId },
      });
      return {
        ok: false,
        error: `Outbox enqueue failed: ${outboxErr.message}`,
        needsReconcile: true,
      };
    }
    outbox = outboxIns as OutboxRow;
    void logPayoutAuditEvent(admin, {
      eventType: "payout_transfer_enqueued",
      actorUserId: params.initiatedBy,
      payoutId: params.rail === "cleaner_payout" ? params.subjectId : null,
      disbursementId: params.rail === "cleaner_earnings" ? params.subjectId : null,
      amountCents: amount,
      reference: params.reference,
      context: { rail: params.rail, outboxId: outbox.id },
    });
  }

  // Claim outbox for send
  const { data: claimed, error: claimErr } = await admin
    .from("payout_transfer_outbox")
    .update({
      status: "pending",
      attempts: (outbox.attempts ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", outbox.id)
    .in("status", ["pending", "failed"])
    .select("id, status, transfer_code, transfer_row_id, reference, attempts")
    .maybeSingle();

  if (claimErr) return { ok: false, error: claimErr.message };
  if (!claimed && outbox.status !== "pending") {
    // Concurrent worker — reload
    const again = await loadOutboxByReference(admin, params.reference);
    if (again?.status === "submitted" || again?.transfer_code) {
      return {
        ok: true,
        transferCode: again.transfer_code,
        reference: params.reference,
        skippedExisting: true,
        outboxId: again.id,
      };
    }
  }

  const transfer = await paystackPostTransfer({
    source: "balance",
    amount,
    recipient: params.recipientCode,
    reason: "Cleaner payout",
    reference: params.reference,
  });

  const now = new Date().toISOString();
  const table = auditTable(params.rail);

  if (!transfer.ok) {
    // Duplicate reference often means Paystack already accepted — verify instead of failing hard.
    if (/duplicate|already|reference/i.test(transfer.error)) {
      const verified = await paystackGetTransferByReference(params.reference);
      if (verified.ok && verified.transferCode) {
        await admin
          .from("payout_transfer_outbox")
          .update({
            status: "submitted",
            transfer_code: verified.transferCode,
            last_error: null,
            paystack_response: { resumed: true, message: transfer.error },
            updated_at: now,
          })
          .eq("id", outbox.id);
        if (outbox.transfer_row_id) {
          await admin
            .from(table)
            .update({ transfer_code: verified.transferCode, status: "processing" })
            .eq("id", outbox.transfer_row_id);
        }
        return {
          ok: true,
          transferCode: verified.transferCode,
          reference: params.reference,
          outboxId: outbox.id,
        };
      }
    }

    if (transfer.networkError) {
      await admin
        .from("payout_transfer_outbox")
        .update({
          status: "needs_reconcile",
          last_error: transfer.error.slice(0, 2000),
          updated_at: now,
        })
        .eq("id", outbox.id);
      void logPayoutAuditEvent(admin, {
        eventType: "payout_transfer_needs_reconcile",
        actorUserId: params.initiatedBy,
        payoutId: params.rail === "cleaner_payout" ? params.subjectId : null,
        disbursementId: params.rail === "cleaner_earnings" ? params.subjectId : null,
        amountCents: amount,
        reference: params.reference,
        context: { error: transfer.error },
      });
      return {
        ok: false,
        error: `Paystack transfer uncertain — left for reconcile (no retry with new reference): ${transfer.error}`,
        needsReconcile: true,
      };
    }

    // Clear business rejection from Paystack — safe to mark failed (same reference on next retry).
    await admin
      .from("payout_transfer_outbox")
      .update({
        status: "failed",
        last_error: transfer.error.slice(0, 2000),
        updated_at: now,
      })
      .eq("id", outbox.id);
    if (outbox.transfer_row_id) {
      await admin
        .from(table)
        .update({ status: "failed", error: transfer.error.slice(0, 2000) })
        .eq("id", outbox.transfer_row_id)
        .neq("status", "success");
    }
    void logPayoutAuditEvent(admin, {
      eventType: "payout_transfer_failed",
      actorUserId: params.initiatedBy,
      payoutId: params.rail === "cleaner_payout" ? params.subjectId : null,
      disbursementId: params.rail === "cleaner_earnings" ? params.subjectId : null,
      amountCents: amount,
      reference: params.reference,
      context: { error: transfer.error },
    });
    return { ok: false, error: transfer.error };
  }

  const transferCode = transfer.json.data?.transfer_code?.trim() ?? null;
  const transferReference = String(transfer.json.data?.reference ?? "").trim() || params.reference;

  const { error: outUpErr } = await admin
    .from("payout_transfer_outbox")
    .update({
      status: "submitted",
      transfer_code: transferCode,
      paystack_response: transfer.json,
      last_error: null,
      updated_at: now,
    })
    .eq("id", outbox.id);

  if (outUpErr) {
    // Money may have moved — never mark failed.
    void logSystemEvent({
      level: "error",
      source: "PAYSTACK_OUTBOX_UPDATE",
      message: "Paystack accepted transfer but outbox update failed",
      context: { reference: params.reference, transferCode, error: outUpErr.message },
    });
  }

  if (outbox.transfer_row_id) {
    const { error: trUpErr } = await admin
      .from(table)
      .update({
        transfer_code: transferCode,
        status: "processing",
        ...(params.rail === "cleaner_earnings" ? { reference: transferReference } : {}),
      })
      .eq("id", outbox.transfer_row_id)
      .neq("status", "success");
    if (trUpErr) {
      void logSystemEvent({
        level: "error",
        source: "PAYSTACK_TRANSFER_AUDIT_UPDATE",
        message: "Paystack accepted transfer but audit row update failed — left processing for reconcile",
        context: { reference: params.reference, transferCode, error: trUpErr.message },
      });
    }
  }

  void logPayoutAuditEvent(admin, {
    eventType: "payout_transfer_submitted",
    actorUserId: params.initiatedBy,
    payoutId: params.rail === "cleaner_payout" ? params.subjectId : null,
    disbursementId: params.rail === "cleaner_earnings" ? params.subjectId : null,
    amountCents: amount,
    reference: params.reference,
    context: { transferCode, outboxId: outbox.id },
  });

  return {
    ok: true,
    transferCode,
    reference: transferReference,
    outboxId: outbox.id,
  };
}

/**
 * Process pending / needs_reconcile outbox rows (cron worker).
 */
export async function processPaystackTransferOutboxBatch(
  admin: SupabaseClient,
  opts?: { limit?: number },
): Promise<{ processed: number; results: SubmitPaystackTransferResult[] }> {
  const limit = Math.min(50, Math.max(1, opts?.limit ?? 25));
  const { data, error } = await admin
    .from("payout_transfer_outbox")
    .select("id, rail, subject_id, cleaner_id, amount_cents, recipient_code, reference, status")
    .in("status", ["pending", "needs_reconcile"])
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);

  const results: SubmitPaystackTransferResult[] = [];
  for (const row of data ?? []) {
    const r = row as {
      rail: PayoutTransferRail;
      subject_id: string;
      cleaner_id: string;
      amount_cents: number;
      recipient_code: string;
      reference: string;
    };
    const result = await submitPaystackTransferViaOutbox(admin, {
      rail: r.rail,
      subjectId: r.subject_id,
      cleanerId: r.cleaner_id,
      amountCents: r.amount_cents,
      recipientCode: r.recipient_code,
      reference: r.reference,
      initiatedBy: "cron/process-payout-outbox",
    });
    results.push(result);
  }
  return { processed: results.length, results };
}
