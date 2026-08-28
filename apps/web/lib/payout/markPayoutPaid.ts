import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { logPayoutAuditEvent } from "@/lib/payout/payoutAudit";

export async function markCleanerPayoutPaid(
  admin: SupabaseClient,
  payoutId: string,
  params: { actorUserId: string },
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

  const { data: testBookings, error: testErr } = await admin
    .from("bookings")
    .select("id")
    .eq("payout_id", payoutId)
    .eq("is_test", true)
    .limit(1);
  if (testErr) return { ok: false, error: testErr.message };
  if ((testBookings?.length ?? 0) > 0) return { ok: false, error: "Cannot mark test payout as paid." };

  // SR-08C: the database trigger attached to this parent update converges direct,
  // roster-member, and team-member paid state inside this same transaction.
  const { data: updated, error } = await admin
    .from("cleaner_payouts")
    .update({ status: "paid", paid_at: new Date().toISOString(), payment_status: "success" })
    .eq("id", payoutId)
    .eq("status", "approved")
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated?.length) return { ok: false, error: "Payout was already updated or is no longer approved." };

  void logSystemEvent({ level: "info", source: "PAYOUT_MARKED_PAID", message: "Cleaner payout batch marked paid", context: { payoutId, actorUserId: actor } });
  void logPayoutAuditEvent(admin, { eventType: "payout_manual_mark_paid", actorUserId: actor, payoutId, newValues: { status: "paid", payment_status: "success" } });
  return { ok: true };
}
