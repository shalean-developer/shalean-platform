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

async function failPayoutExecution(
  admin: SupabaseClient,
  payoutId: string,
  status: "failed" | "partial_failed" = "failed",
) {
  await admin.from("cleaner_payouts").update({ payment_status: status }).eq("id", payoutId).eq("status", "approved");
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
    const ensuredResume = await ensurePaystackRecipient(admin, payout.cleaner_id);
    if (!ensuredResume.ok) return { ok: false, error: ensuredResume.error, status: 400 };
    const resumed = await submitPaystackTransferViaOutbox(admin, {
      rail: "cleaner_payout",
      subjectId: payout.id,
      cleanerId: payout.cleaner_id,
      amountCents: cents(payout.total_amount_cents),
      recipientCode: ensuredResume.recipientCode,
      reference: immutableCleanerPayoutReference(payout.id),
      initiatedBy: params.paidBy,
    });
    if (!resumed.ok) return resumed;
    await admin
      .from("cleaner_payouts")
      .update({
        payment_status: "processing",
        payment_reference: resumed.transferCode ?? payout.payment_reference ?? null,
      })
      .eq("id", payout.id)
      .eq("status", "approved");
    return resumed;
  }

  const { data: claimed, error: claimErr } = await admin
    .from("cleaner_payouts")
    .update({ payment_status: "processing" })
    .eq("id", payout.id)
    .eq("status", "approved")
    .in("payment_status", ["pending", "failed", "partial_failed"])
    .select("id");
  if (claimErr) return { ok: false, error: claimErr.message };
  if (!claimed?.length) return { ok: false, error: "Payout payment is already in progress.", status: 409 };

  const loadedItems = await loadCleanerPayoutBatchItems(admin, payout.id);
  if (loadedItems.error) {
    await failPayoutExecution(admin, payout.id);
    return { ok: false, error: loadedItems.error };
  }

  const batchItems = loadedItems.items;
  if (batchItems.length === 0) {
    await failPayoutExecution(admin, payout.id);
    return { ok: false, error: "Payout has no linked earning items.", status: 400 };
  }
  if (batchItems.some((row) => row.is_test)) {
    await failPayoutExecution(admin, payout.id);
    return { ok: false, error: "Cannot pay a payout batch containing test bookings.", status: 400 };
  }
  if (batchItems.some((row) => row.cleaner_id !== payout.cleaner_id)) {
    await failPayoutExecution(admin, payout.id);
    return { ok: false, error: "Payout contains earning items for a different cleaner.", status: 400 };
  }
  if (batchItems.some((row) => row.refunded_at)) {
    await failPayoutExecution(admin, payout.id);
    return { ok: false, error: "Payout contains refunded bookings.", status: 400 };
  }
  if (batchItems.some((row) => String(row.booking_status ?? "").toLowerCase() !== "completed")) {
    await failPayoutExecution(admin, payout.id);
    return { ok: false, error: "Payout contains non-completed bookings.", status: 400 };
  }

  const bookingTotal = loadedItems.totalCents;
  const payoutAmount = cents(payout.total_amount_cents);
  if (payoutAmount <= 0 || (!manuallyAdjusted && bookingTotal !== payoutAmount)) {
    await failPayoutExecution(admin, payout.id);
    return { ok: false, error: "Payout total does not match linked booking totals.", status: 400 };
  }

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
