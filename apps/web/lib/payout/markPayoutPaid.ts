import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { logPayoutAuditEvent } from "@/lib/payout/payoutAudit";

export type CleanerPayoutPaymentMethod = "bank_transfer" | "manual_legacy";

export async function markCleanerPayoutPaid(
  admin: SupabaseClient,
  payoutId: string,
  params: {
    actorUserId: string;
    paymentMethod?: CleanerPayoutPaymentMethod;
    paymentReference?: string | null;
    paidAt?: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: payout, error: payoutErr } = await admin
    .from("cleaner_payouts")
    .select(
      "id, status, payment_method, payment_reference, created_by, amount_adjusted_by, approved_by",
    )
    .eq("id", payoutId)
    .maybeSingle();
  if (payoutErr) return { ok: false, error: payoutErr.message };
  if (!payout) return { ok: false, error: "Payout not found." };

  const actor = params.actorUserId.trim();
  if (!actor) return { ok: false, error: "Payout releaser identity is missing." };

  const method = params.paymentMethod ?? "manual_legacy";
  const reference = String(params.paymentReference ?? "").trim();
  if (method === "bank_transfer" && reference.length < 3) {
    return { ok: false, error: "Bank transfer reference is required before marking the payout paid." };
  }

  let paidAt = new Date().toISOString();
  if (params.paidAt) {
    const parsed = new Date(params.paidAt);
    if (!Number.isFinite(parsed.getTime())) return { ok: false, error: "Invalid payment date." };
    const jhbToday = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Johannesburg",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const paidYmd = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Johannesburg",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(parsed);
    if (paidYmd > jhbToday) {
      return { ok: false, error: "Payment date cannot be in the future." };
    }
    paidAt = parsed.toISOString();
  }

  const status = String(payout.status ?? "").trim().toLowerCase();
  const existingMethod = String(payout.payment_method ?? "").trim().toLowerCase();
  const existingReference = String(payout.payment_reference ?? "").trim();

  // Idempotent bank-transfer replay: let the transactional RPC verify/converge
  // an already-recorded settlement with the same reference.
  const isMatchingBankReplay =
    method === "bank_transfer" &&
    status === "paid" &&
    existingMethod === "bank_transfer" &&
    existingReference === reference;

  if (!isMatchingBankReplay && status !== "approved") {
    return { ok: false, error: "Only approved payout batches can be marked paid." };
  }

  const preparedBy = String(payout.created_by ?? "").trim();
  const adjustedBy = String(payout.amount_adjusted_by ?? "").trim();
  const approvedBy = String(payout.approved_by ?? "").trim();

  // Scheduled monthly generation is a system preparation and intentionally has
  // created_by=null. Maker-checker still requires an approver and a distinct releaser.
  if (!isMatchingBankReplay) {
    if (!approvedBy) {
      return { ok: false, error: "Payout approver identity is missing; approve the batch before release." };
    }
    if (preparedBy && actor === preparedBy) {
      return { ok: false, error: "Maker–checker: the admin who prepared this payout cannot also mark it paid." };
    }
    if (adjustedBy && actor === adjustedBy) {
      return { ok: false, error: "Maker–checker: the admin who adjusted this payout cannot also mark it paid." };
    }
    if (actor === approvedBy) {
      return { ok: false, error: "Maker–checker: the admin who approved this payout cannot also mark it paid." };
    }
  }

  const { data: testBookings, error: testErr } = await admin
    .from("bookings")
    .select("id")
    .eq("payout_id", payoutId)
    .eq("is_test", true)
    .limit(1);
  if (testErr) return { ok: false, error: testErr.message };
  if ((testBookings?.length ?? 0) > 0) return { ok: false, error: "Cannot mark test payout as paid." };

  if (method === "bank_transfer") {
    // Backward-compatible safety fence: block bank settlement before the
    // database migration is present when any Paystack outbox still represents
    // an active or unresolved intent for this payout.
    const { data: unresolvedOutbox, error: unresolvedOutboxErr } = await admin
      .from("payout_transfer_outbox")
      .select("id, status, last_error")
      .eq("rail", "cleaner_payout")
      .eq("subject_id", payoutId)
      .limit(50);
    if (unresolvedOutboxErr) return { ok: false, error: unresolvedOutboxErr.message };

    const blocksBankSettlement = (unresolvedOutbox ?? []).some((row) => {
      const outboxStatus = String(row.status ?? "").trim().toLowerCase();
      if (["pending", "sending", "submitted", "needs_reconcile", "succeeded"].includes(outboxStatus)) return true;
      if (outboxStatus !== "failed") return false;
      return /duplicate|already|reference/i.test(String(row.last_error ?? ""));
    });
    if (blocksBankSettlement) {
      return {
        ok: false,
        error: "Paystack transfer history still requires reconciliation before bank settlement.",
      };
    }

    const { error: settleErr } = await admin.rpc("settle_cleaner_payout_bank_transfer", {
      p_payout_id: payoutId,
      p_paid_by: actor,
      p_reference: reference,
      p_paid_at: paidAt,
    });
    if (settleErr) return { ok: false, error: settleErr.message };

    void logSystemEvent({
      level: "info",
      source: "PAYOUT_BANK_TRANSFER_PAID",
      message: isMatchingBankReplay
        ? "Cleaner bank-transfer payout replay reconciled"
        : "Cleaner payout recorded as paid by bank transfer",
      context: {
        payoutId,
        actorUserId: actor,
        paymentMethod: method,
        paymentReference: reference,
        paidAt,
        preparedBy: preparedBy || "system",
        replay: isMatchingBankReplay,
      },
    });
    if (!isMatchingBankReplay) {
      void logPayoutAuditEvent(admin, {
        eventType: "payout_bank_transfer_paid",
        actorUserId: actor,
        payoutId,
        reference,
        context: { prepared_by: preparedBy || "system" },
        newValues: {
          status: "paid",
          payment_status: "success",
          payment_method: method,
          payment_reference: reference,
          paid_at: paidAt,
        },
      });
    }
    return { ok: true };
  }

  const { data: updated, error } = await admin
    .from("cleaner_payouts")
    .update({
      status: "paid",
      paid_at: paidAt,
      payment_status: "success",
      payment_method: method,
      payment_reference: reference || null,
      paid_by: actor,
    })
    .eq("id", payoutId)
    .eq("status", "approved")
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated?.length) return { ok: false, error: "Payout was already updated or is no longer approved." };

  const { error: bookingSyncErr } = await admin.rpc("mark_bookings_paid_for_cleaner_payout", {
    p_payout_id: payoutId,
  });
  if (bookingSyncErr) return { ok: false, error: bookingSyncErr.message };

  void logSystemEvent({
    level: "info",
    source: "PAYOUT_MARKED_PAID",
    message: "Cleaner payout batch marked paid",
    context: { payoutId, actorUserId: actor, paymentMethod: method, paymentReference: reference || null, paidAt },
  });
  void logPayoutAuditEvent(admin, {
    eventType: "payout_manual_mark_paid",
    actorUserId: actor,
    payoutId,
    reference: reference || null,
    newValues: {
      status: "paid",
      payment_status: "success",
      payment_method: method,
      payment_reference: reference || null,
      paid_at: paidAt,
    },
  });
  return { ok: true };
}
