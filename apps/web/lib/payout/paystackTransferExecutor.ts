import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getPaystackBaseUrl } from "@/lib/payout/paystackOrigin";
import { logPayoutAuditEvent } from "@/lib/payout/payoutAudit";
import { loadCleanerPayoutBatchItems } from "@/lib/payout/loadCleanerPayoutBatchItems";
import { applyTransferFailed, applyTransferSuccess } from "@/lib/payout/paystackTransferStatus";

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
  updated_at: string;
  last_error?: string | null;
  reconcile_started_at?: string | null;
};

function auditTable(rail: PayoutTransferRail): "payout_transfers" | "earnings_disbursement_transfers" {
  return rail === "cleaner_payout" ? "payout_transfers" : "earnings_disbursement_transfers";
}

function subjectColumn(rail: PayoutTransferRail): "payout_id" | "disbursement_id" {
  return rail === "cleaner_payout" ? "payout_id" : "disbursement_id";
}

async function releaseOutboxSendLease(
  admin: SupabaseClient,
  outboxId: string,
  attempts: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await admin
    .from("payout_transfer_outbox")
    .update({ status: "pending", updated_at: new Date().toISOString() })
    .eq("id", outboxId)
    .eq("status", "sending")
    .eq("attempts", attempts)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Outbox lease changed before release." };
  return { ok: true };
}


async function validateCleanerPayoutBeforeProviderPost(
  admin: SupabaseClient,
  params: SubmitPaystackTransferParams,
  amount: number,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (params.rail !== "cleaner_payout") return { ok: true };

  const { data: payoutData, error: payoutErr } = await admin
    .from("cleaner_payouts")
    .select("id, cleaner_id, total_amount_cents, status, payment_status, amount_adjusted_at")
    .eq("id", params.subjectId)
    .maybeSingle();
  if (payoutErr) return { ok: false, error: payoutErr.message, status: 500 };
  if (!payoutData) return { ok: false, error: "Payout not found.", status: 404 };

  const payout = payoutData as {
    cleaner_id?: string | null;
    total_amount_cents?: number | null;
    status?: string | null;
    payment_status?: string | null;
    amount_adjusted_at?: string | null;
  };
  if (String(payout.status ?? "").toLowerCase() !== "approved") {
    return { ok: false, error: "Payout is no longer approved.", status: 409 };
  }
  if (String(payout.payment_status ?? "").toLowerCase() !== "processing") {
    return { ok: false, error: "Payout is no longer in processing state.", status: 409 };
  }
  if (String(payout.cleaner_id ?? "").trim() !== params.cleanerId.trim()) {
    return { ok: false, error: "Payout cleaner does not match outbox cleaner.", status: 409 };
  }
  if (Math.max(0, Math.round(Number(payout.total_amount_cents) || 0)) !== amount) {
    return { ok: false, error: "Payout amount does not match outbox amount.", status: 409 };
  }

  const { error: guardErr } = await admin.rpc("claim_cleaner_payout_paystack_processing", {
    p_payout_id: params.subjectId,
    p_allow_existing_processing: true,
  });
  if (guardErr) {
    const message = String(guardErr.message ?? "Payout failed locked linked-booking validation.");
    const permanentBusinessRule = [
      "linked_refund_or_ineligible_booking_blocks_payout",
      "payout_cleaner_mismatch",
      "payout_not_found",
      "payout_not_approved",
      "payout_not_processing",
    ].some((code) => message.includes(code));
    return {
      ok: false,
      error: message,
      status: permanentBusinessRule ? 409 : 500,
    };
  }

  const loaded = await loadCleanerPayoutBatchItems(admin, params.subjectId);
  if (loaded.error) return { ok: false, error: loaded.error, status: 500 };
  if (loaded.items.length === 0) {
    return { ok: false, error: "Payout has no linked earning items.", status: 409 };
  }
  if (loaded.items.some((item) => item.is_test)) {
    return { ok: false, error: "Payout contains a test booking.", status: 409 };
  }
  if (loaded.items.some((item) => item.cleaner_id !== params.cleanerId)) {
    return { ok: false, error: "Payout contains earning items for a different cleaner.", status: 409 };
  }
  if (loaded.items.some((item) => item.refunded_at)) {
    return { ok: false, error: "Payout contains refunded bookings.", status: 409 };
  }
  if (loaded.items.some((item) => String(item.booking_status ?? "").toLowerCase() !== "completed")) {
    return { ok: false, error: "Payout contains non-completed bookings.", status: 409 };
  }
  if (!payout.amount_adjusted_at && loaded.totalCents !== amount) {
    return { ok: false, error: "Payout total does not match linked booking totals.", status: 409 };
  }

  return { ok: true };
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
): Promise<
  | { ok: true; transferCode: string | null; status: string | null }
  | { ok: false; error: string; httpStatus?: number; networkError?: boolean }
> {
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
      return {
        ok: false,
        error: json.message ?? `Verify failed ${res.status}`,
        httpStatus: res.status,
      };
    }
    return {
      ok: true,
      transferCode: json.data?.transfer_code?.trim() ?? null,
      status: String(json.data?.status ?? "").trim().toLowerCase() || null,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error verifying transfer",
      networkError: true,
    };
  }
}

async function loadOutboxByReference(
  admin: SupabaseClient,
  reference: string,
): Promise<OutboxRow | null> {
  const { data, error } = await admin
    .from("payout_transfer_outbox")
    .select("id, status, transfer_code, transfer_row_id, reference, attempts, updated_at, last_error, reconcile_started_at")
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
    const transferCode = existingSuccess.transfer_code?.trim() ?? null;
    if (transferCode) {
      try {
        await applyTransferSuccess(admin, {
          transfer_code: transferCode,
          reference: existingSuccess.reference?.trim() || params.reference,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Existing successful transfer reconciliation failed.";
        await admin
          .from("payout_transfer_outbox")
          .update({
            status: "needs_reconcile",
            last_error: message.slice(0, 2000),
            updated_at: new Date().toISOString(),
          })
          .eq("reference", params.reference)
          .neq("status", "succeeded");
        return {
          ok: false,
          error: message,
          needsReconcile: true,
        };
      }
    }

    return {
      ok: true,
      transferCode,
      reference: existingSuccess.reference?.trim() || params.reference,
      skippedExisting: true,
      outboxId: "",
    };
  }

  let outbox = await loadOutboxByReference(admin, params.reference);

  // Already submitted — resume / verify, never create a second Paystack transfer.
  if (outbox && (outbox.status === "submitted" || outbox.status === "needs_reconcile" || outbox.status === "succeeded")) {
    if (outbox.status === "succeeded") {
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
      const providerStatus = String(verified.status ?? "").trim().toLowerCase();
      const providerSucceeded = providerStatus === "success" || providerStatus === "successful";
      const providerFailed = ["failed", "reversed", "cancelled", "canceled"].includes(providerStatus);

      if (outbox.transfer_row_id) {
        const table = auditTable(params.rail);
        const { error: auditCodeErr } = await admin
          .from(table)
          .update({
            transfer_code: verified.transferCode,
            ...(providerFailed ? {} : { status: "processing" }),
            ...(params.rail === "cleaner_earnings" ? { reference: params.reference } : {}),
          })
          .eq("id", outbox.transfer_row_id)
          .neq("status", "success");
        if (auditCodeErr) {
          return {
            ok: false,
            error: auditCodeErr.message,
            needsReconcile: true,
          };
        }
      }

      if (providerSucceeded) {
        try {
          await applyTransferSuccess(admin, {
            transfer_code: verified.transferCode,
            reference: params.reference,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Verified transfer success convergence failed.";
          await admin
            .from("payout_transfer_outbox")
            .update({
              status: "needs_reconcile",
              last_error: message.slice(0, 2000),
              updated_at: new Date().toISOString(),
            })
            .eq("id", outbox.id)
            .neq("status", "succeeded");
          return {
            ok: false,
            error: message,
            status: 500,
            needsReconcile: true,
          };
        }
        return {
          ok: true,
          transferCode: verified.transferCode,
          reference: params.reference,
          skippedExisting: true,
          outboxId: outbox.id,
        };
      }

      if (providerFailed) {
        try {
          await applyTransferFailed(admin, {
            transfer_code: verified.transferCode,
            reference: params.reference,
            reason: `Paystack verify returned ${providerStatus}`,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Verified transfer failure convergence failed.";
          await admin
            .from("payout_transfer_outbox")
            .update({
              status: "needs_reconcile",
              last_error: message.slice(0, 2000),
              updated_at: new Date().toISOString(),
            })
            .eq("id", outbox.id)
            .neq("status", "succeeded");
          return {
            ok: false,
            error: message,
            status: 500,
            needsReconcile: true,
          };
        }

        // The outbox may not yet have carried the provider transfer_code (for
        // example after an uncertain POST). Retire this exact intent by id/reference
        // so it cannot remain needs_reconcile and monopolize future worker batches.
        const { error: retireFailedErr } = await admin
          .from("payout_transfer_outbox")
          .update({
            status: "failed",
            transfer_code: verified.transferCode,
            last_error: `Paystack verify returned ${providerStatus}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", outbox.id)
          .eq("reference", params.reference)
          .neq("status", "succeeded");

        if (retireFailedErr) {
          return {
            ok: false,
            error: retireFailedErr.message,
            status: 500,
            needsReconcile: true,
          };
        }

        return {
          ok: false,
          error: `Paystack transfer is ${providerStatus}; payout state was converged for retry or bank settlement.`,
          status: 409,
        };
      }

      await admin
        .from("payout_transfer_outbox")
        .update({
          status: "submitted",
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
        needsReconcile: true,
      };
    }
    const reconcileStart = outbox.reconcile_started_at ?? outbox.updated_at;
    const reconcileAgeMs = Date.now() - new Date(reconcileStart).getTime();
    const verifiedAbsent =
      !verified.ok &&
      (verified.httpStatus === 404 || /not found|does not exist/i.test(verified.error));

    if (
      params.rail === "cleaner_payout" &&
      outbox.status === "needs_reconcile" &&
      !String(outbox.transfer_code ?? "").trim() &&
      verifiedAbsent &&
      Number.isFinite(reconcileAgeMs) &&
      reconcileAgeMs >= 15 * 60 * 1000
    ) {
      const { error: absentErr } = await admin.rpc("fail_cleaner_payout_outbox_validation", {
        p_outbox_id: outbox.id,
        p_error: "Paystack reference verified absent after reconciliation grace period; use bank-transfer settlement.",
        p_expected_status: "needs_reconcile",
        p_expected_attempts: outbox.attempts,
      });

      if (absentErr) {
        return {
          ok: false,
          error: absentErr.message,
          status: 500,
          needsReconcile: true,
        };
      }

      return {
        ok: false,
        error: "Paystack reference verified absent after reconciliation grace period; bank-transfer settlement is now available.",
        status: 404,
      };
    }

    const { data: retryableIntent, error: retryableErr } = await admin
      .from("payout_transfer_outbox")
      .update({
        status: "needs_reconcile",
        last_error: verified.ok
          ? "Provider verification returned no transfer code."
          : String(verified.error ?? "Provider verification unresolved.").slice(0, 2000),
        updated_at: new Date().toISOString(),
      })
      .eq("id", outbox.id)
      .in("status", ["submitted", "needs_reconcile"])
      .select("id")
      .maybeSingle();

    if (retryableErr) {
      return {
        ok: false,
        error: retryableErr.message,
        status: 500,
        needsReconcile: true,
      };
    }
    if (!retryableIntent) {
      return {
        ok: false,
        error: "Payout transfer intent changed before it could remain retryable.",
        status: 409,
        needsReconcile: true,
      };
    }

    return {
      ok: false,
      transferCode: null,
      reference: params.reference,
      outboxId: outbox.id,
      needsReconcile: true,
      error: verified.ok
        ? "Provider verification returned no transfer code; intent remains retryable."
        : String(verified.error ?? "Provider verification unresolved."),
    };
  }

  // Exclusive sender lease. A second worker never POSTs while another owns "sending".
  // If a worker crashed after leasing but before POST, verify the immutable reference first.
  if (outbox && outbox.status === "sending") {
    const verified = await paystackGetTransferByReference(params.reference);
    if (verified.ok && verified.transferCode) {
      const table = auditTable(params.rail);
      if (!outbox.transfer_row_id) {
        return {
          ok: false,
          error: "Recovered Paystack transfer has no linked transfer audit row.",
          needsReconcile: true,
        };
      }

      const { error: auditErr } = await admin
        .from(table)
        .update({
          transfer_code: verified.transferCode,
          status: "processing",
          ...(params.rail === "cleaner_earnings" ? { reference: params.reference } : {}),
        })
        .eq("id", outbox.transfer_row_id)
        .neq("status", "success");

      if (auditErr) {
        return {
          ok: false,
          error: `Recovered Paystack transfer could not update audit row: ${auditErr.message}`,
          needsReconcile: true,
        };
      }

      const providerSucceeded = verified.status === "success" || verified.status === "successful";
      if (providerSucceeded) {
        try {
          await applyTransferSuccess(admin, {
            transfer_code: verified.transferCode,
            reference: params.reference,
          });
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : "Recovered transfer success reconciliation failed.",
            needsReconcile: true,
          };
        }
      } else {
        const { data: retired, error: retireErr } = await admin
          .from("payout_transfer_outbox")
          .update({
            status: "submitted",
            transfer_code: verified.transferCode,
            updated_at: new Date().toISOString(),
          })
          .eq("id", outbox.id)
          .eq("status", "sending")
          .eq("attempts", outbox.attempts)
          .select("id")
          .maybeSingle();

        if (retireErr || !retired) {
          return {
            ok: false,
            error: retireErr?.message ?? "Recovered outbox lease changed before submission convergence.",
            needsReconcile: true,
          };
        }
      }

      return {
        ok: true,
        transferCode: verified.transferCode,
        reference: params.reference,
        skippedExisting: true,
        outboxId: outbox.id,
        needsReconcile: !providerSucceeded,
      };
    }

    const leaseAgeMs = Date.now() - new Date(outbox.updated_at).getTime();
    const verifyNotFound =
      !verified.ok &&
      (verified.httpStatus === 404 || /not found|does not exist/i.test(verified.error));

    if (verifyNotFound && Number.isFinite(leaseAgeMs) && leaseAgeMs >= 15 * 60 * 1000) {
      const released = await releaseOutboxSendLease(admin, outbox.id, outbox.attempts);
      if (!released.ok) {
        return {
          ok: false,
          error: released.error,
          needsReconcile: true,
        };
      }
      return submitPaystackTransferViaOutbox(admin, params);
    }

    return {
      ok: false,
      error: verified.ok
        ? "Payout transfer is still leased for submission."
        : verified.error,
      needsReconcile: true,
    };
  }

  // Failed outbox: if cleaner Paystack payouts are disabled and provider history
  // exists, reconcile that immutable reference before any retry lease/cancellation.
  // A retained transfer_code means the intent is not definitely unsent.
  const failedOutboxHasProviderUncertainty =
    Boolean(String(outbox?.transfer_code ?? "").trim()) ||
    /duplicate|already|reference/i.test(String(outbox?.last_error ?? ""));

  if (
    outbox &&
    outbox.status === "failed" &&
    params.rail === "cleaner_payout" &&
    String(process.env.ENABLE_CLEANER_PAYSTACK_PAYOUTS ?? "").trim().toLowerCase() !== "true" &&
    failedOutboxHasProviderUncertainty
  ) {
    const { data: reconciledIntent, error: reconcileStateErr } = await admin
      .from("payout_transfer_outbox")
      .update({ status: "needs_reconcile", updated_at: new Date().toISOString() })
      .eq("id", outbox.id)
      .eq("status", "failed")
      .select("id")
      .maybeSingle();

    if (reconcileStateErr) {
      return {
        ok: false,
        error: reconcileStateErr.message,
        status: 500,
        needsReconcile: true,
      };
    }
    if (!reconciledIntent) {
      return {
        ok: false,
        error: "Failed payout intent changed before it could enter reconciliation.",
        status: 409,
        needsReconcile: true,
      };
    }

    return submitPaystackTransferViaOutbox(admin, params);
  }

  // Failed outbox with no retained provider history: reuse same reference — reset
  // to pending for retry. When cleaner Paystack is disabled the final send boundary
  // atomically cancels this definitely-unsent intent into the bank-transfer path.
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
      .select("id, status, transfer_code, transfer_row_id, reference, attempts, updated_at, last_error, reconcile_started_at")
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

  // A pending cleaner-payout intent with prior attempts has crossed a send lease
  // before. If Paystack is now disabled, its immutable reference must be verified
  // before any terminal cancellation; it is not definitely unsent.
  if (
    outbox &&
    outbox.status === "pending" &&
    params.rail === "cleaner_payout" &&
    String(process.env.ENABLE_CLEANER_PAYSTACK_PAYOUTS ?? "").trim().toLowerCase() !== "true" &&
    Math.max(0, Math.round(Number(outbox.attempts ?? 0))) > 0
  ) {
    const { data: priorAttemptIntent, error: priorAttemptErr } = await admin
      .from("payout_transfer_outbox")
      .update({
        status: "needs_reconcile",
        last_error: "Prior send attempt requires provider verification before bank settlement.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", outbox.id)
      .eq("status", "pending")
      .eq("attempts", outbox.attempts)
      .select("id")
      .maybeSingle();

    if (priorAttemptErr) {
      return {
        ok: false,
        error: priorAttemptErr.message,
        status: 500,
        needsReconcile: true,
      };
    }
    if (!priorAttemptIntent) {
      return {
        ok: false,
        error: "Pending payout intent changed before it could enter reconciliation.",
        status: 409,
        needsReconcile: true,
      };
    }

    return submitPaystackTransferViaOutbox(admin, params);
  }

  // Claim outbox for send using an exclusive pending -> sending lease.
  const expectedAttempts = outbox.attempts ?? 0;
  const { data: claimed, error: claimErr } = await admin
    .from("payout_transfer_outbox")
    .update({
      status: "sending",
      attempts: expectedAttempts + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", outbox.id)
    .eq("status", "pending")
    .eq("attempts", expectedAttempts)
    .select("id, status, transfer_code, transfer_row_id, reference, attempts, updated_at")
    .maybeSingle();

  if (claimErr) {
    return {
      ok: false,
      error: claimErr.message,
      status: 500,
      needsReconcile: true,
    };
  }
  if (!claimed) {
    const again = await loadOutboxByReference(admin, params.reference);
    if (again?.status === "submitted" || again?.status === "succeeded" || again?.transfer_code) {
      return {
        ok: true,
        transferCode: again.transfer_code,
        reference: params.reference,
        skippedExisting: true,
        outboxId: again.id,
      };
    }
    return {
      ok: false,
      error: "Payout outbox send is already leased or no longer eligible.",
      needsReconcile: true,
    };
  }
  outbox = claimed as OutboxRow;

  const safetyGate = await validateCleanerPayoutBeforeProviderPost(admin, params, amount);
  if (!safetyGate.ok) {
    const now = new Date().toISOString();
    const permanentValidationFailure = safetyGate.status >= 400 && safetyGate.status < 500;

    if (permanentValidationFailure && params.rail === "cleaner_payout") {
      const { error: terminalErr } = await admin.rpc("fail_cleaner_payout_outbox_validation", {
        p_outbox_id: outbox.id,
        p_error: safetyGate.error,
        p_expected_status: "sending",
        p_expected_attempts: outbox.attempts,
      });

      if (terminalErr) {
        void logSystemEvent({
          level: "error",
          source: "PAYSTACK_OUTBOX_TERMINAL_CONVERGENCE",
          message: "Could not atomically converge permanently blocked payout outbox; leaving it retryable",
          context: {
            payoutId: params.subjectId,
            outboxId: outbox.id,
            reference: params.reference,
            error: terminalErr.message,
          },
        });
        const released = await releaseOutboxSendLease(admin, outbox.id, outbox.attempts);
        return {
          ok: false,
          error: released.ok
            ? terminalErr.message || "Could not converge blocked payout outbox."
            : `${terminalErr.message || "Could not converge blocked payout outbox."} Lease release also failed: ${released.error}`,
          status: 500,
          needsReconcile: true,
        };
      }

      void logPayoutAuditEvent(admin, {
        eventType: "payout_transfer_failed",
        actorUserId: params.initiatedBy,
        payoutId: params.subjectId,
        amountCents: amount,
        reference: params.reference,
        context: {
          reason: "permanent_pre_provider_validation_failure",
          error: safetyGate.error,
          outboxId: outbox.id,
        },
      });
    }

    void logSystemEvent({
      level: "warn",
      source: "PAYSTACK_OUTBOX_SAFETY_GATE",
      message: permanentValidationFailure
        ? "Permanently blocked Paystack transfer before provider POST"
        : "Temporarily blocked Paystack transfer before provider POST",
      context: {
        rail: params.rail,
        subjectId: params.subjectId,
        reference: params.reference,
        error: safetyGate.error,
        permanent: permanentValidationFailure,
      },
    });
    if (!permanentValidationFailure && params.rail === "cleaner_payout") {
      const released = await releaseOutboxSendLease(admin, outbox.id, outbox.attempts);
      return {
        ok: false,
        error: released.ok
          ? safetyGate.error
          : `${safetyGate.error} Lease release also failed: ${released.error}`,
        status: safetyGate.status,
        needsReconcile: true,
      };
    }

    return safetyGate;
  }

  // MASTER-03B: the final money-send boundary. Existing submitted/succeeded
  // transfers are reconciled above even when cleaner Paystack payouts are disabled,
  // but no fresh provider POST may occur for the cleaner_payout rail without
  // explicit operational opt-in.
  if (
    params.rail === "cleaner_payout" &&
    String(process.env.ENABLE_CLEANER_PAYSTACK_PAYOUTS ?? "").trim().toLowerCase() !== "true"
  ) {
    const { error: cancelErr } = await admin.rpc("fail_cleaner_payout_outbox_validation", {
      p_outbox_id: outbox.id,
      p_error: "Cleaner Paystack payouts disabled; use bank-transfer settlement.",
      p_expected_status: "sending",
      p_expected_attempts: outbox.attempts,
    });

    if (cancelErr) {
      return {
        ok: false,
        error: cancelErr.message,
        status: 500,
        needsReconcile: true,
      };
    }

    return {
      ok: false,
      error: "Cleaner Paystack payouts are disabled. Fresh transfer intent was cancelled before provider submission; use bank-transfer settlement.",
      status: 403,
    };
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
    // Duplicate/reference rejection means Paystack may already own the immutable
    // reference. Verification failure is therefore uncertain, never a safe terminal
    // failure. Keep the intent in needs_reconcile until the provider outcome is known.
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
          .eq("id", outbox.id)
          .eq("status", "sending")
          .eq("attempts", outbox.attempts);
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

      const { error: uncertainErr } = await admin
        .from("payout_transfer_outbox")
        .update({
          status: "needs_reconcile",
          last_error: `Duplicate/reference response; verification unresolved: ${
            verified.ok ? "provider returned no transfer code" : verified.error
          }`.slice(0, 2000),
          updated_at: now,
        })
        .eq("id", outbox.id)
        .eq("status", "sending")
        .eq("attempts", outbox.attempts);

      if (uncertainErr) {
        return {
          ok: false,
          error: uncertainErr.message,
          status: 500,
          needsReconcile: true,
        };
      }

      return {
        ok: false,
        error: "Paystack reference may already exist; transfer left for reconciliation.",
        needsReconcile: true,
      };
    }

    if (transfer.networkError) {
      await admin
        .from("payout_transfer_outbox")
        .update({
          status: "needs_reconcile",
          last_error: transfer.error.slice(0, 2000),
          updated_at: now,
        })
        .eq("id", outbox.id)
        .eq("status", "sending")
        .eq("attempts", outbox.attempts);
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
      .eq("id", outbox.id)
      .eq("status", "sending")
      .eq("attempts", outbox.attempts);
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
    .eq("id", outbox.id)
    .eq("status", "sending")
    .eq("attempts", outbox.attempts);

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
  const cleanerPaystackEnabled =
    String(process.env.ENABLE_CLEANER_PAYSTACK_PAYOUTS ?? "").trim().toLowerCase() === "true";

  const { data, error } = await admin
    .from("payout_transfer_outbox")
    .select("id, rail, subject_id, cleaner_id, amount_cents, recipient_code, reference, status, attempts, transfer_code")
    .in("status", ["pending", "sending", "needs_reconcile"])
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);

  const results: SubmitPaystackTransferResult[] = [];
  for (const row of data ?? []) {
    const r = row as {
      id: string;
      rail: PayoutTransferRail;
      subject_id: string;
      cleaner_id: string;
      amount_cents: number;
      recipient_code: string;
      reference: string;
      status: string;
      attempts?: number | null;
      transfer_code?: string | null;
    };

    // A pending cleaner-payout outbox has never owned a provider-send lease and has
    // no submitted/uncertain provider state. When the rail is disabled, converge
    // that definitely-unsent intent to terminal failed so the approved payout can
    // be settled by bank transfer. This also prevents old disabled rows from
    // permanently occupying the shared oldest-first outbox batch.
    if (!cleanerPaystackEnabled && r.rail === "cleaner_payout" && r.status === "pending") {
      if (
        String(r.transfer_code ?? "").trim() ||
        Math.max(0, Math.round(Number(r.attempts ?? 0))) > 0
      ) {
        const { error: markReconcileErr } = await admin
          .from("payout_transfer_outbox")
          .update({
            status: "needs_reconcile",
            updated_at: new Date().toISOString(),
          })
          .eq("id", r.id)
          .eq("status", "pending")
          .eq("attempts", Math.max(0, Math.round(Number(r.attempts ?? 0))));

        if (markReconcileErr) {
          results.push({
            ok: false,
            error: markReconcileErr.message,
            status: 500,
            needsReconcile: true,
          });
          continue;
        }

        results.push(
          await submitPaystackTransferViaOutbox(admin, {
            rail: r.rail,
            subjectId: r.subject_id,
            cleanerId: r.cleaner_id,
            amountCents: r.amount_cents,
            recipientCode: r.recipient_code,
            reference: r.reference,
            initiatedBy: "cron/process-payout-outbox",
          }),
        );
        continue;
      }

      const { error: convergeErr } = await admin.rpc("fail_cleaner_payout_outbox_validation", {
        p_outbox_id: r.id,
        p_error: "Cleaner Paystack payouts disabled; use bank-transfer settlement.",
        p_expected_status: "pending",
        p_expected_attempts: Math.max(0, Math.round(Number(r.attempts ?? 0))),
      });
      if (convergeErr) {
        results.push({
          ok: false,
          error: convergeErr.message,
          status: 500,
          needsReconcile: true,
        });
      } else {
        results.push({
          ok: false,
          error: "Cleaner Paystack payout intent cancelled before provider submission; use bank-transfer settlement.",
          status: 403,
        });
      }
      continue;
    }

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
