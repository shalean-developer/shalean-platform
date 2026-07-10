import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";

export async function markCleanerPayoutPaid(
  admin: SupabaseClient,
  payoutId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: testBookings, error: testErr } = await admin
    .from("bookings")
    .select("id")
    .eq("payout_id", payoutId)
    .eq("is_test", true)
    .limit(1);

  if (testErr) return { ok: false, error: testErr.message };
  if ((testBookings?.length ?? 0) > 0) {
    return { ok: false, error: "Cannot mark test payout as paid." };
  }

  const { error } = await admin
    .from("cleaner_payouts")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      payment_status: "success",
    })
    .eq("id", payoutId)
    .eq("status", "approved");

  if (error) return { ok: false, error: error.message };

  const { error: bookingSyncErr } = await admin.rpc("mark_bookings_paid_for_cleaner_payout", {
    p_payout_id: payoutId,
  });
  if (bookingSyncErr) return { ok: false, error: bookingSyncErr.message };

  void logSystemEvent({
    level: "info",
    source: "PAYOUT_MARKED_PAID",
    message: "Cleaner payout batch marked paid",
    context: { payoutId },
  });
  return { ok: true };
}
