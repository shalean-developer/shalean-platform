import type { SupabaseClient } from "@supabase/supabase-js";
import { LIFECYCLE_SKIP } from "@/lib/booking/lifecycleEmailSkipReasons";

/** Cancel all unsent lifecycle jobs for a booking (audit history preserved). */
export async function cancelUnsentBookingLifecycleJobs(
  supabase: SupabaseClient,
  bookingId: string,
  reason: string = LIFECYCLE_SKIP.bookingCancelled,
): Promise<void> {
  await supabase
    .from("booking_lifecycle_jobs")
    .update({
      status: "cancelled",
      skipped_reason: reason.slice(0, 500),
      last_error: reason.slice(0, 500),
      processed_at: new Date().toISOString(),
    })
    .eq("booking_id", bookingId)
    .is("sent_at", null)
    .in("status", ["pending", "failed_retryable", "processing"]);
}
