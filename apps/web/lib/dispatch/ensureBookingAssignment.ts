import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assignCleanerToBooking,
  type AssignCleanerOptions,
  type AssignResult,
} from "@/lib/dispatch/assignCleaner";
import { metrics } from "@/lib/metrics/counters";

/** Call sites for dispatch.assignment.* metrics and tracing. */
export type EnsureAssignmentSource =
  | "paystack_checkout"
  | "admin_dispatch_api"
  | "cleaner_job_reject"
  | "offer_decline_redispatch"
  | "whatsapp_offer_decline"
  | "escalate_ack_timeout"
  | "dispatch_retry_queue"
  | "subscription_autopay"
  | "customer_reschedule";

export type EnsureBookingAssignmentOptions = AssignCleanerOptions & {
  source: EnsureAssignmentSource;
};

/**
 * Single entry for auto-assign attempts: wraps `assignCleanerToBooking` with metrics.
 * Callers still own cleaner/customer notifications after success when needed.
 */
export async function ensureBookingAssignment(
  supabase: SupabaseClient,
  bookingId: string,
  options: EnsureBookingAssignmentOptions,
): Promise<AssignResult> {
  const { source, retryEscalation, smartAssign } = options;
  const retryEsc = retryEscalation ?? 0;
  metrics.increment("dispatch.assignment.attempt", {
    bookingId,
    source,
    retryEscalation: retryEsc,
  });

  const r = await assignCleanerToBooking(supabase, bookingId, { retryEscalation: retryEsc, smartAssign });

  if (r.ok) {
    metrics.increment("dispatch.assignment.success", { bookingId, source, cleanerId: r.cleanerId });
  } else {
    metrics.increment("dispatch.assignment.failure", {
      bookingId,
      source,
      error: r.error,
      message: r.message ?? null,
    });
  }

  return r;
}
