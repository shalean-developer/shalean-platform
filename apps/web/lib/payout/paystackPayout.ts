import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { ensurePaystackRecipient } from "@/lib/payout/ensurePaystackRecipient";
import { logPayoutAuditEvent } from "@/lib/payout/payoutAudit";
import {
  immutableCleanerPayoutReference,
  submitPaystackTransferViaOutbox,
} from "@/lib/payout/paystackTransferExecutor";
import { loadCleanerPayoutBatchItems } from "@/lib/payout/loadCleanerPayoutBatchItems";

type PayoutRow = {
  id: string;
  cleaner_id: string;
  total_amount_cents: number;
  status: string;
  payment_status?: string | null;
  payment_reference?: string | null;
  amount_adjusted_at?: string | null;
  calculated_amount_cents?: number | null;
  adjustment_note?: string | null;
  created_by?: string | null;
  amount_adjusted_by?: string | null;
  approved_by?: string | null;
};

type PaystackTransferResult =
  | {
      ok: true;
      transferCode: string | null;
      reference: string;
      skippedExisting?: boolean;
      needsReconcile?: boolean;
    }
  | {
      ok: false;
      error: string;
      status?: number;
      needsReconcile?: boolean;
    };

function cents(value: unknown): number {
  if (value == null || !Number.isFinite(Number(value))) return 0;
  return Math.max(0, Math.round(Number(value)));
}

async function loadAndValidatePayoutBatch(
  admin: SupabaseClient,
  payout: PayoutRow,
  manuallyAdjusted: boolean,
): Promise<
  | { ok: true; items: Awaited<ReturnType<typeof loadCleanerPayoutBatchItems>>["items"]; payoutAmount: number }
  | { ok: false; error: string; status: number }
> {
  const loadedItems = await loadCleanerPayoutBatchItems(admin, payout.id);
  if (loadedItems.error) return { ok: false, error: loadedItems.error, status: 500 };

  const batchItems = loadedItems.items;
  if (batchItems.length === 0) {
    return { ok: false, error: "Payout has no linked earning items.", status: 400 };
  }
  if (batchItems.some((row) => row.is_test)) {
    return { ok: false, error: "Cannot pay a payout batch containing test bookings.", status: 400 };
  }
  if (batchItems.some((row) => row.cleaner_id !== payout.cleaner_id)) {
    return { ok: false, error: "Payout contains earning items for a different cleaner.", status: 400 };
  }
  if (batchItems.some((row) => row.refunded_at)) {
    return { ok: false, error: "Payout contains refunded bookings.", status: 400 };
  }
  if (batchItems.some((row) => String(row.booking_status ?? "").toLowerCase() !== "completed")) {
    return { ok: false, error: "Payout contains non-completed bookings.", status: 400 };
  }

  const bookingTotal = loadedItems.totalCents;
  const payoutAmount = cents(payout.total_amount_cents);
  if (payoutAmount <= 0 || (!manuallyAdjusted && bookingTotal !== payoutAmount)) {
    return { ok: false, error: "Payout total does not match linked booking totals.", status: 400 };
  }

  return { ok: true, items: batchItems, payoutAmount };
}

async function failPayoutExecution(
  admin: SupabaseClient,
  payoutId: string,
  status: "failed" | "partial_failed" = "failed",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await admin
    .from("cleaner_payouts")
    .update({ payment_status: status })
    .eq("id", payoutId)
    .eq("status", "approved");
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function convergeDeterministicResumeFailure(
  admin: SupabaseClient,
  payoutId: string,
  error: string,
): Promise<{ ok: true } | { ok: false; error: string; needsReconcile: true }> {
  const reference = immutableCleanerPayoutReference(payoutId);
  const { data: outboxData, error: outboxErr } = await admin
    .from("payout_transfer_outbox")
    .select("id, status, transfer_code, attempts")
    .eq("reference", reference)
    .maybeSingle();

  if (outboxErr) {
    return { ok: false, error: outboxErr.message, needsReconcile: true };
  }

  const outbox = outboxData as {
    id?: string;
    status?: string | null;
    transfer_code?: string | null;
    attempts?: number | null;
  } | null;
  const outboxStatus = String(outbox?.status ?? "").toLowerCase();

  // Submitted / uncertain provider state may already represent money movement.
  // Never terminally fail it from application validation.
  if (
    outbox &&
    (outboxStatus === "submitted" ||
      outboxStatus === "needs_reconcile" ||
      outboxStatus === "succeeded" ||
      Boolean(outbox.transfer_code))
  ) {
    return {
      ok: false,
      error: "Existing Paystack transfer requires reconciliation before payout state can change.",
      needsReconcile: true,
    };
  }

  if (outbox?.id && outboxStatus === "failed") {
    const failed = await failPayoutExecution(admin, payoutId);
    if (!failed.ok) {
      return { ok: false, error: failed.error, needsReconcile: true };
    }
    return { ok: true };
  }

  if (outbox?.id && outboxStatus === "pending") {
    const { error: convergeErr } = await admin.rpc("fail_cleaner_payout_outbox_validation", {
      p_outbox_id: outbox.id,
      p_error: error,
      p_expected_status: "pending",
      p_expected_attempts: Math.max(0, Math.round(Number(outbox.attempts ?? 0))),
    });
    if (convergeErr) {
      return { ok: false, error: convergeErr.message, needsReconcile: true };
    }
    return { ok: true };
  }

  if (outbox?.id) {
    return {
      ok: false,
      error: "Outbox state changed before terminal convergence; reconciliation required.",
      needsReconcile: true,
    };
  }

  const failed = await failPayoutExecution(admin, payoutId);
  if (!failed.ok) {
    return { ok: false, error: failed.error, needsReconcile: true };
  }
  return { ok: true };
}

/**
 * Pay an approved weekly/monthly `cleaner_payouts` batch via the shared outbox transfer executor.
 * Money is only sent through {@link submitPaystackTransferViaOutbox}.
 */
export async function payCleanerPayoutWithPaystack(
  admin: SupabaseClient,
  params: { payoutId: string; paidBy: string },
): Promise<PaystackTransferResult> {
  const { data: payoutData, error: payoutErr } = await admin
    .from("cleaner_payouts")
    .select(
      "id, cleaner_id, total_amount_cents, status, payment_status, payment_reference, amount_adjusted_at, calculated_amount_cents, adjustment_note, created_by, amount_adjusted_by, approved_by",
    )
    .eq("id", params.payoutId)
    .maybeSingle();
  if (payoutErr) return { ok: false, error: payoutErr.message };
  if (!payoutData) return { ok: false, error: "Payout not found.", status: 404 };

  const payout = payoutData as PayoutRow;
  if (payout.status !== "approved") {
    return { ok: false, error: "Only approved payout batches can be paid.", status: 400 };
  }

  const createdBy = String(payout.created_by ?? "").trim();
  const adjustedBy = String(payout.amount_adjusted_by ?? "").trim();
  const approvedBy = String(payout.approved_by ?? "").trim();
  if (!createdBy || !approvedBy) {
    return {
      ok: false,
      error: "Maker–checker: payout preparer or approver is missing. Recreate and approve the batch before release.",
      status: 403,
    };
  }
  if (createdBy === approvedBy) {
    return {
      ok: false,
      error: "Maker–checker: the payout preparer and approver must be different users.",
      status: 403,
    };
  }
  if (createdBy === params.paidBy || adjustedBy === params.paidBy || approvedBy === params.paidBy) {
    return {
      ok: false,
      error: "Maker–checker: payout release must be performed by a user who did not prepare, adjust, or approve the batch.",
      status: 403,
    };
  }

  const manuallyAdjusted = Boolean(payout.amount_adjusted_at);
  if (manuallyAdjusted) {
    const note = String(payout.adjustment_note ?? "").trim();
    if (note.length < 3) {
      return {
        ok: false,
        error: "Adjusted payouts require an adjustment reason before payment.",
        status: 400,
      };
    }
    const calculated = cents(payout.calculated_amount_cents);
    const total = cents(payout.total_amount_cents);
    if (calculated > 0 && total !== calculated && note.length < 3) {
      return { ok: false, error: "Override reason required when amount differs from calculated.", status: 400 };
    }
  }

  void logPayoutAuditEvent(admin, {
    eventType: "payout_pay_requested",
    actorUserId: params.paidBy,
    payoutId: payout.id,
    amountCents: cents(payout.total_amount_cents),
    reference: immutableCleanerPayoutReference(payout.id),
  });

  const { data: existingSuccess, error: existingErr } = await admin
    .from("payout_transfers")
    .select("id, transfer_code, reference")
    .eq("payout_id", payout.id)
    .eq("status", "success")
    .maybeSingle();
  if (existingErr) return { ok: false, error: existingErr.message };
  if (existingSuccess) {
    const existing = existingSuccess as { transfer_code: string | null; reference?: string | null };
    const now = new Date().toISOString();
    await admin
      .from("cleaner_payouts")
      .update({
        status: "paid",
        paid_at: now,
        payment_status: "success",
        payment_method: "paystack",
        payment_reference: existing.transfer_code ?? payout.payment_reference ?? null,
      })
      .eq("id", payout.id)
      .eq("status", "approved");
    await admin.rpc("mark_bookings_paid_for_cleaner_payout", { p_payout_id: payout.id });
    return {
      ok: true,
      transferCode: existing.transfer_code,
      reference: existing.reference ?? immutableCleanerPayoutReference(payout.id),
      skippedExisting: true,
    };
  }

  const paymentStatus = String(payout.payment_status ?? "")
    .trim()
    .toLowerCase();
  if (paymentStatus === "processing") {
    const { error: resumeGuardErr } = await admin.rpc("claim_cleaner_payout_paystack_processing", {
      p_payout_id: payout.id,
      p_allow_existing_processing: true,
    });
    if (resumeGuardErr) {
      const message = String(resumeGuardErr.message ?? "");
      const deterministicResumeBlock =
        message.includes("linked_refund_or_ineligible_booking_blocks_payout") ||
        message.includes("payout_cleaner_mismatch");

      if (deterministicResumeBlock) {
        const humanError = message.includes("payout_cleaner_mismatch")
          ? "Payout resume is blocked because a linked earning belongs to a different cleaner."
          : "Payout resume is blocked because a linked booking is refunded, in refund processing, test, or no longer completed.";
        const converged = await convergeDeterministicResumeFailure(admin, payout.id, humanError);
        if (!converged.ok) {
          return { ok: false, error: converged.error, status: 500, needsReconcile: true };
        }
        return { ok: false, error: humanError, status: 409 };
      }

      if (
        message.includes("payout_not_found") ||
        message.includes("payout_not_approved") ||
        message.includes("payout_not_processing")
      ) {
        return { ok: false, error: message || "Payout state changed before resume.", status: 409 };
      }

      return {
        ok: false,
        error: message || "Could not revalidate processing payout.",
        status: 500,
        needsReconcile: true,
      };
    }

    const resumeBatch = await loadAndValidatePayoutBatch(admin, payout, manuallyAdjusted);
    if (!resumeBatch.ok) {
      if (resumeBatch.status >= 500) {
        return {
          ok: false,
          error: resumeBatch.error,
          status: resumeBatch.status,
          needsReconcile: true,
        };
      }
      const converged = await convergeDeterministicResumeFailure(admin, payout.id, resumeBatch.error);
      if (!converged.ok) {
        return { ok: false, error: converged.error, status: 500, needsReconcile: true };
      }
      return resumeBatch;
    }

    const ensuredResume = await ensurePaystackRecipient(admin, payout.cleaner_id);
    if (!ensuredResume.ok) {
      if (ensuredResume.retryable) {
        return {
          ok: false,
          error: ensuredResume.error,
          status: ensuredResume.status ?? 500,
          needsReconcile: true,
        };
      }
      const converged = await convergeDeterministicResumeFailure(admin, payout.id, ensuredResume.error);
      if (!converged.ok) {
        return { ok: false, error: converged.error, status: 500, needsReconcile: true };
      }
      return { ok: false, error: ensuredResume.error, status: ensuredResume.status ?? 400 };
    }
    const resumed = await submitPaystackTransferViaOutbox(admin, {
      rail: "cleaner_payout",
      subjectId: payout.id,
      cleanerId: payout.cleaner_id,
      amountCents: resumeBatch.payoutAmount,
      recipientCode: ensuredResume.recipientCode,
      reference: immutableCleanerPayoutReference(payout.id),
      initiatedBy: params.paidBy,
    });
    if (!resumed.ok) {
      if (resumed.needsReconcile) return resumed;
      await failPayoutExecution(admin, payout.id);
      return resumed;
    }
    await admin
      .from("cleaner_payouts")
      .update({
        payment_status: "processing",
        payment_method: "paystack",
        payment_reference: resumed.transferCode ?? payout.payment_reference ?? null,
      })
      .eq("id", payout.id)
      .eq("status", "approved");
    return resumed;
  }

  const { error: claimErr } = await admin.rpc("claim_cleaner_payout_paystack_processing", {
    p_payout_id: payout.id,
    p_allow_existing_processing: false,
  });
  if (claimErr) {
    const message = String(claimErr.message ?? "");
    if (message.includes("linked_refund_or_ineligible_booking_blocks_payout")) {
      return {
        ok: false,
        error: "Payout is blocked because a linked booking is refunded, in refund processing, test, or no longer completed.",
        status: 409,
      };
    }
    if (message.includes("payout_payment_already_in_progress")) {
      return { ok: false, error: "Payout payment is already in progress.", status: 409 };
    }
    return { ok: false, error: message || "Could not claim payout for Paystack.", status: 400 };
  }

  const validatedBatch = await loadAndValidatePayoutBatch(admin, payout, manuallyAdjusted);
  if (!validatedBatch.ok) {
    await failPayoutExecution(admin, payout.id);
    return validatedBatch;
  }
  const batchItems = validatedBatch.items;
  const payoutAmount = validatedBatch.payoutAmount;

  const ensured = await ensurePaystackRecipient(admin, payout.cleaner_id);
  if (!ensured.ok) {
    await failPayoutExecution(admin, payout.id);
    return { ok: false, error: ensured.error, status: 400 };
  }

  const reference = immutableCleanerPayoutReference(payout.id);
  const transfer = await submitPaystackTransferViaOutbox(admin, {
    rail: "cleaner_payout",
    subjectId: payout.id,
    cleanerId: payout.cleaner_id,
    amountCents: payoutAmount,
    recipientCode: ensured.recipientCode,
    reference,
    initiatedBy: params.paidBy,
  });

  if (!transfer.ok) {
    if (transfer.needsReconcile) {
      void logSystemEvent({
        level: "warn",
        source: "PAYOUT_PAYSTACK_NEEDS_RECONCILE",
        message: "Transfer left processing for reconcile; reference unchanged",
        context: { payoutId: payout.id, reference, error: transfer.error },
      });
      return transfer;
    }
    await failPayoutExecution(admin, payout.id);
    return transfer;
  }

  const { error: updateErr } = await admin
    .from("cleaner_payouts")
    .update({
      status: "approved",
      payment_status: "processing",
      payment_method: "paystack",
      payment_reference: transfer.transferCode ?? reference,
    })
    .eq("id", payout.id)
    .eq("status", "approved");
  if (updateErr) {
    void logSystemEvent({
      level: "error",
      source: "PAYOUT_PAYSTACK_STATUS_UPDATE",
      message: "Transfer submitted but payout status update failed",
      context: { payoutId: payout.id, reference, error: updateErr.message },
    });
  }

  void logSystemEvent({
    level: "info",
    source: "PAYOUT_PAYSTACK_PROCESSING",
    message: "Cleaner payout transfer sent to Paystack; awaiting webhook confirmation",
    context: {
      payoutId: payout.id,
      cleanerId: payout.cleaner_id,
      paidBy: params.paidBy,
      transferCode: transfer.transferCode,
      transferReference: transfer.reference,
      bookingIds: [...new Set(batchItems.map((item) => item.booking_id))],
      earningItemCount: batchItems.length,
    },
  });

  return {
    ok: true,
    transferCode: transfer.transferCode,
    reference: transfer.reference,
    skippedExisting: transfer.skippedExisting,
    needsReconcile: transfer.needsReconcile,
  };
}
