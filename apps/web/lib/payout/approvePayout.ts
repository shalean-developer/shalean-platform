import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { logPayoutAuditEvent } from "@/lib/payout/payoutAudit";

function makerCheckerEnabled(): boolean {
  return String(process.env.PAYOUT_MAKER_CHECKER ?? "")
    .trim()
    .toLowerCase() === "true";
}

function allowSelfApprove(): boolean {
  return String(process.env.PAYOUT_ALLOW_SELF_APPROVE ?? "")
    .trim()
    .toLowerCase() === "true";
}

export async function approveCleanerPayout(
  admin: SupabaseClient,
  params: { payoutId: string; approvedBy: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: testBookings, error: testErr } = await admin
    .from("bookings")
    .select("id")
    .eq("payout_id", params.payoutId)
    .eq("is_test", true)
    .limit(1);

  if (testErr) return { ok: false, error: testErr.message };
  if ((testBookings?.length ?? 0) > 0) {
    return { ok: false, error: "Cannot approve a payout batch containing test bookings." };
  }

  if (makerCheckerEnabled() && !allowSelfApprove()) {
    const { data: row, error: loadErr } = await admin
      .from("cleaner_payouts")
      .select("id, created_by, amount_adjusted_by")
      .eq("id", params.payoutId)
      .maybeSingle();
    if (loadErr) return { ok: false, error: loadErr.message };
    const createdBy = String((row as { created_by?: string | null } | null)?.created_by ?? "").trim();
    const adjustedBy = String((row as { amount_adjusted_by?: string | null } | null)?.amount_adjusted_by ?? "").trim();
    if (createdBy && createdBy === params.approvedBy) {
      return {
        ok: false,
        error: "Maker–checker: the admin who generated this payout cannot also approve it.",
      };
    }
    if (adjustedBy && adjustedBy === params.approvedBy) {
      return {
        ok: false,
        error: "Maker–checker: the admin who adjusted the amount cannot also approve it.",
      };
    }
  }

  const patch = {
    status: "approved" as const,
    approved_at: new Date().toISOString(),
    approved_by: params.approvedBy,
  };

  const { data: updatedPending, error: errPending } = await admin
    .from("cleaner_payouts")
    .update(patch)
    .eq("id", params.payoutId)
    .eq("status", "pending")
    .select("id");

  if (errPending) return { ok: false, error: errPending.message };

  let updated = updatedPending;
  if (!updated?.length) {
    const { data: updatedFrozen, error: errFrozen } = await admin
      .from("cleaner_payouts")
      .update(patch)
      .eq("id", params.payoutId)
      .eq("status", "frozen")
      .is("payout_run_id", null)
      .select("id");
    if (errFrozen) return { ok: false, error: errFrozen.message };
    updated = updatedFrozen;
  }

  if (!updated?.length) return { ok: false, error: "Payout is not pending or was already updated." };

  void logSystemEvent({
    level: "info",
    source: "PAYOUT_APPROVED",
    message: "Cleaner payout batch approved",
    context: { payoutId: params.payoutId, approvedBy: params.approvedBy },
  });

  void logPayoutAuditEvent(admin, {
    eventType: "payout_approved",
    actorUserId: params.approvedBy,
    payoutId: params.payoutId,
    newValues: { status: "approved" },
  });

  return { ok: true };
}
