import type { SupabaseClient } from "@supabase/supabase-js";
import { PAYMENT_RECOVERY_SKIP } from "@/lib/booking/paymentRecoverySkipReasons";

/** Cancel unsent recovery work; an expiry worker may preserve its own active job. */
export async function cancelUnsentBookingPaymentRecoveryJobs(
  supabase: SupabaseClient,
  bookingId: string,
  reason: string = PAYMENT_RECOVERY_SKIP.paymentCancelledOnSuccess,
  options?: { preserveJobId?: string },
): Promise<void> {
  const now = new Date().toISOString();
  let query = supabase
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
  if (options?.preserveJobId) query = query.neq("id", options.preserveJobId);
  await query;
}
