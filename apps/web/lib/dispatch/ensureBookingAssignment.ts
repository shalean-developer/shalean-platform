import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assignCleanerToBooking,
  type AssignCleanerOptions,
  type AssignResult,
} from "@/lib/dispatch/assignCleaner";
import {
  compactDispatchMetricTags,
  loadDispatchMetricSegmentation,
  type DispatchMetricSegmentation,
} from "@/lib/dispatch/dispatchMetricContext";
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
  /** Prefer explicit values for metrics (e.g. `attempt_number` right after atomic bump). */
  metricSegmentationOverrides?: Partial<
    Pick<DispatchMetricSegmentation, "attempt_number" | "assignment_type" | "fallback_reason">
  >;
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
  const { source, retryEscalation, smartAssign, metricSegmentationOverrides } = options;
  const retryEsc = retryEscalation ?? 0;
  const seg = await loadDispatchMetricSegmentation(supabase, bookingId);
  const o = metricSegmentationOverrides;
  const segFields = {
    assignment_type: o?.assignment_type ?? seg.assignment_type,
    fallback_reason: o?.fallback_reason ?? seg.fallback_reason,
    attempt_number: o?.attempt_number ?? seg.attempt_number,
  };
  const metricTags = compactDispatchMetricTags(segFields);

  metrics.increment("dispatch.assignment.attempt", {
    bookingId,
    source,
    retryEscalation: retryEsc,
    ...metricTags,
  });

  const mergedSmart =
    source === "paystack_checkout" ? { ...(smartAssign ?? {}), assignmentMode: "soft" as const } : smartAssign;

  const r = await assignCleanerToBooking(supabase, bookingId, { retryEscalation: retryEsc, smartAssign: mergedSmart });

  if (r.ok) {
    metrics.increment("dispatch.assignment.success", {
      bookingId,
      source,
      cleanerId: r.cleanerId,
      ...metricTags,
    });
  } else {
    metrics.increment("dispatch.assignment.failure", {
      bookingId,
      source,
      error: r.error,
      message: r.message ?? null,
      ...metricTags,
    });
  }

  return r;
}
