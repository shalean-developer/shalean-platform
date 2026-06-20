import type { SupabaseClient } from "@supabase/supabase-js";
import { PAYMENT_RECOVERY_SKIP } from "@/lib/booking/paymentRecoverySkipReasons";

/** Cancel all unsent payment recovery jobs for a booking (audit history preserved). */
export async function cancelUnsentBookingPaymentRecoveryJobs(
  supabase: SupabaseClient,
  bookingId: string,
  reason: string = PAYMENT_RECOVERY_SKIP.paymentCancelledOnSuccess,
): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from("booking_payment_recovery_jobs")
    .update({
      status: "cancelled",
      skipped_reason: reason.slice(0, 500),
      last_error: null,
      processed_at: now,
      updated_at: now,
    })
    .eq("booking_id", bookingId)
    .is("sent_at", null)
    .in("status", ["pending", "failed_retryable", "processing"]);
}
