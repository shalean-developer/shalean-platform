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
    .select("id, status, created_by, amount_adjusted_by, approved_by")
    .eq("id", payoutId)
    .maybeSingle();
  if (payoutErr) return { ok: false, error: payoutErr.message };
  if (!payout) return { ok: false, error: "Payout not found." };
  if (payout.status !== "approved") return { ok: false, error: "Only approved payout batches can be marked paid." };

  const actor = params.actorUserId.trim();
  const preparedBy = String(payout.created_by ?? "").trim();
  const adjustedBy = String(payout.amount_adjusted_by ?? "").trim();
  const approvedBy = String(payout.approved_by ?? "").trim();
  if (!actor) return { ok: false, error: "Payout releaser identity is missing." };
  if (!preparedBy) return { ok: false, error: "Payout preparer identity is missing; recreate the batch before release." };
  if (!approvedBy) return { ok: false, error: "Payout approver identity is missing; approve the batch before release." };
  if (actor === preparedBy) return { ok: false, error: "Maker–checker: the admin who prepared this payout cannot also mark it paid." };
  if (adjustedBy && actor === adjustedBy) return { ok: false, error: "Maker–checker: the admin who adjusted this payout cannot also mark it paid." };
  if (actor === approvedBy) return { ok: false, error: "Maker–checker: the admin who approved this payout cannot also mark it paid." };

  const method = params.paymentMethod ?? "manual_legacy";
  const reference = String(params.paymentReference ?? "").trim();
  if (method === "bank_transfer" && reference.length < 3) {
    return { ok: false, error: "Bank transfer reference is required before marking the payout paid." };
  }

  let paidAt = new Date().toISOString();
  if (params.paidAt) {
    const parsed = new Date(params.paidAt);
    if (!Number.isFinite(parsed.getTime())) return { ok: false, error: "Invalid payment date." };
    paidAt = parsed.toISOString();
  }

  const { data: testBookings, error: testErr } = await admin
    .from("bookings")
    .select("id")
    .eq("payout_id", payoutId)
    .eq("is_test", true)
    .limit(1);
  if (testErr) return { ok: false, error: testErr.message };
  if ((testBookings?.length ?? 0) > 0) return { ok: false, error: "Cannot mark test payout as paid." };

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

  const { error: bookingSyncErr } = await admin.rpc("mark_bookings_paid_for_cleaner_payout", { p_payout_id: payoutId });
  if (bookingSyncErr) return { ok: false, error: bookingSyncErr.message };

  void logSystemEvent({
    level: "info",
    source: method === "bank_transfer" ? "PAYOUT_BANK_TRANSFER_PAID" : "PAYOUT_MARKED_PAID",
    message: method === "bank_transfer" ? "Cleaner payout recorded as paid by bank transfer" : "Cleaner payout batch marked paid",
    context: { payoutId, actorUserId: actor, paymentMethod: method, paymentReference: reference || null, paidAt },
  });
  void logPayoutAuditEvent(admin, {
    eventType: method === "bank_transfer" ? "payout_bank_transfer_paid" : "payout_manual_mark_paid",
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
