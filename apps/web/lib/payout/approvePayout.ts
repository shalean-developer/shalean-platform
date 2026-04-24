import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";

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

  const { data: updated, error } = await admin
    .from("cleaner_payouts")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: params.approvedBy,
    })
    .eq("id", params.payoutId)
    .eq("status", "pending")
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!updated?.length) return { ok: false, error: "Payout is not pending or was already updated." };

  void logSystemEvent({
    level: "info",
    source: "PAYOUT_APPROVED",
    message: "Cleaner payout batch approved",
    context: { payoutId: params.payoutId, approvedBy: params.approvedBy },
  });

  return { ok: true };
}
