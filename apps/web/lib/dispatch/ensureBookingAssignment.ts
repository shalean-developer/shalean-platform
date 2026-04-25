import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type AssignCleanerOptions,
} from "@/lib/dispatch/assignCleaner";
import { assignBooking, type AssignBookingResult } from "@/lib/dispatch/assignBooking";
import {
  compactDispatchMetricTags,
  loadDispatchMetricSegmentation,
  type DispatchMetricSegmentation,
} from "@/lib/dispatch/dispatchMetricContext";
import { metrics } from "@/lib/metrics/counters";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { persistCleanerPayoutIfUnset } from "@/lib/payout/persistCleanerPayout";

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
): Promise<AssignBookingResult> {
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

  const r = await assignBooking(supabase, bookingId, { retryEscalation: retryEsc, smartAssign: mergedSmart });

  if (r.ok) {
    if (r.assignmentKind === "individual") {
      const payout = await persistCleanerPayoutIfUnset({ admin: supabase, bookingId, cleanerId: r.cleanerId });
      if (!payout.ok) {
        await reportOperationalIssue("error", "ensureBookingAssignment", `payout missing: ${payout.error}`, {
          bookingId,
          cleanerId: r.cleanerId,
          source,
        });
      }
    }
    metrics.increment("dispatch.assignment.success", {
      bookingId,
      source,
      cleanerId: r.assignmentKind === "individual" ? r.cleanerId : null,
      teamId: r.assignmentKind === "team" ? r.teamId : null,
      assignmentKind: r.assignmentKind,
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
