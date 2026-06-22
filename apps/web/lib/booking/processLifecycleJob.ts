import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveBookingEmailLabelsFromRow } from "@/lib/notifications/bookingNotifyFormat";

import { normalizeEmail } from "@/lib/booking/normalizeEmail";

import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";

import {

  classifySendError,

  computeAppointmentStartIso,

  evaluateCustomerFrequencyLimit,

  evaluateRebookEligibility,

  evaluateReviewRequestLifecycleEligibility,

  evaluateStaleJob,

  isBookingCancelledForLifecycle,

  isBookingUnpaidForLifecycle,

  isRebookLifecycleJobType,

  logFrequencyLimitSkip,

  TERMINAL_FAILURE_ATTEMPTS,

} from "@/lib/booking/lifecycleEmailGuards";

import { LIFECYCLE_SKIP } from "@/lib/booking/lifecycleEmailSkipReasons";

import { getEffectiveLifecycleEmailSettings } from "@/lib/booking/lifecycleEmailSettings";

import { incrementLifecycleMetric } from "@/lib/booking/lifecycleEmailMetrics";

import {

  buildLifecycleEmailPreview,

  sendReminderEmail,

  sendReviewEmail,

  sendRebookEmail,

  sendRebookReminderEmail,

  type LifecycleEmailBookingContext,

} from "@/lib/email/lifecycleEmails";

import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";



export type LifecycleJobRow = {

  id: string;

  booking_id: string;

  job_type: string;

  customer_email: string;

  attempts: number | null;

};



export type ProcessLifecycleResult = "sent" | "skipped" | "retry" | "terminal";



async function markSkipped(

  supabase: SupabaseClient,

  jobId: string,

  reason: string,

  jobType: string,

): Promise<void> {

  const now = new Date().toISOString();

  await supabase

    .from("booking_lifecycle_jobs")

    .update({

      status: "skipped",

      skipped_reason: reason.slice(0, 500),

      processed_at: now,

      last_error: null,

    })

    .eq("id", jobId);

  void incrementLifecycleMetric(supabase, { jobType, outcome: "skipped" });

}



async function markCancelled(

  supabase: SupabaseClient,

  jobId: string,

  reason: string,

): Promise<void> {

  await supabase

    .from("booking_lifecycle_jobs")

    .update({

      status: "cancelled",

      last_error: reason.slice(0, 500),

      processed_at: new Date().toISOString(),

    })

    .eq("id", jobId);

}



async function claimJobForProcessing(

  supabase: SupabaseClient,

  jobId: string,

): Promise<{ ok: true; attempts: number } | { ok: false }> {

  const now = new Date().toISOString();

  const { data, error } = await supabase

    .from("booking_lifecycle_jobs")

    .update({ status: "processing", processed_at: now })

    .eq("id", jobId)

    .in("status", ["pending", "failed_retryable"])

    .select("attempts")

    .maybeSingle();



  if (error || !data) return { ok: false };

  return { ok: true, attempts: typeof data.attempts === "number" ? data.attempts : 0 };

}



async function revertToPending(supabase: SupabaseClient, jobId: string): Promise<void> {

  await supabase

    .from("booking_lifecycle_jobs")

    .update({ status: "pending", processed_at: null })

    .eq("id", jobId)

    .eq("status", "processing");

}



/**

 * Sends lifecycle email for one job row. Idempotent: skips if already sent.

 */

export async function processLifecycleJob(

  supabase: SupabaseClient,

  row: LifecycleJobRow,

): Promise<ProcessLifecycleResult> {

  const jobId = row.id;

  const bookingId = row.booking_id;

  const jobType = row.job_type;



  const { data: fresh, error: freshErr } = await supabase

    .from("booking_lifecycle_jobs")

    .select("sent_at, status, attempts")

    .eq("id", jobId)

    .maybeSingle();



  if (freshErr || !fresh) {

    await reportOperationalIssue("warn", "processLifecycleJob", `Job row missing: ${freshErr?.message}`, { jobId });

    return "skipped";

  }



  if (fresh.sent_at || fresh.status === "sent") return "skipped";

  if (fresh.status === "processing") return "skipped";



  const claim = await claimJobForProcessing(supabase, jobId);

  if (!claim.ok) return "skipped";



  const attempts0 = claim.attempts;

  const settings = await getEffectiveLifecycleEmailSettings(supabase);



  const rawEmail = row.customer_email?.trim() ?? "";

  let to = "";

  try {

    to = rawEmail ? normalizeEmail(rawEmail) : "";

  } catch {

    to = "";

  }

  if (!to || to.length < 3) {

    await supabase

      .from("booking_lifecycle_jobs")

      .update({

        status: "failed_terminal",

        last_error: "Invalid email",

        attempts: TERMINAL_FAILURE_ATTEMPTS,

        processed_at: new Date().toISOString(),

      })

      .eq("id", jobId);

    await reportOperationalIssue("warn", "processLifecycleJob", "Invalid customer email", { jobId, bookingId });

    void incrementLifecycleMetric(supabase, { jobType, outcome: "failed" });

    return "terminal";

  }



  const { data: booking, error: bErr } = await supabase

    .from("bookings")

    .select(

      "id, service, service_slug, booking_snapshot, location, suburb, status, completed_at, cleaner_id, is_team_job, team_id, date, time, user_id, recurring_id, is_recurring_generated, payment_status, amount_paid_cents, total_paid_cents, total_paid_zar",

    )

    .eq("id", bookingId)

    .maybeSingle();



  if (bErr || !booking) {

    const nextAttempts = attempts0 + 1;

    const terminal = nextAttempts >= TERMINAL_FAILURE_ATTEMPTS;

    await supabase

      .from("booking_lifecycle_jobs")

      .update({

        attempts: nextAttempts,

        last_error: "Booking not found",

        status: terminal ? "failed_terminal" : "failed_retryable",

        processed_at: new Date().toISOString(),

      })

      .eq("id", jobId);

    await reportOperationalIssue("warn", "processLifecycleJob", `Booking missing: ${bErr?.message ?? "none"}`, {

      jobId,

      bookingId,

    });

    void incrementLifecycleMetric(supabase, { jobType, outcome: "failed" });

    return terminal ? "terminal" : "retry";

  }



  const bookingRow = booking as Record<string, unknown>;
  const snap = (bookingRow.booking_snapshot as BookingSnapshotV1 | null | undefined) ?? null;
  const userId = typeof bookingRow.user_id === "string" ? bookingRow.user_id : null;

  if (isBookingCancelledForLifecycle(bookingRow)) {

    await markCancelled(supabase, jobId, LIFECYCLE_SKIP.bookingCancelled);

    return "skipped";

  }



  if (isBookingUnpaidForLifecycle(bookingRow)) {

    await markSkipped(supabase, jobId, LIFECYCLE_SKIP.bookingUnpaid, jobType);

    return "skipped";

  }



  const appointmentStartIso = computeAppointmentStartIso(booking as { booking_snapshot?: BookingSnapshotV1 | null; date?: string | null });

  const stale = evaluateStaleJob({ jobType, appointmentStartIso });

  if (stale.stale) {

    await markSkipped(supabase, jobId, stale.reason, jobType);

    void logSystemEvent({

      level: "info",

      source: "processLifecycleJob",

      message: "lifecycle.stale.skipped",

      context: { jobId, bookingId, jobType, skipReason: stale.reason },

    });

    return "skipped";

  }



  if (jobType === "review_request") {

    const rev = evaluateReviewRequestLifecycleEligibility(bookingRow, { appointmentStartIso });

    if (!rev.allowed) {

      await markSkipped(supabase, jobId, rev.reason, jobType);

      void logSystemEvent({

        level: "info",

        source: "processLifecycleJob",

        message: "lifecycle.review_request.skipped",

        context: { jobId, bookingId, skipReason: rev.reason },

      });

      return "skipped";

    }

  }



  if (isRebookLifecycleJobType(jobType)) {

    const rebook = await evaluateRebookEligibility({

      supabase,

      userId,

      customerEmail: to,

      excludeBookingId: bookingId,

      recurringId: typeof bookingRow.recurring_id === "string" ? bookingRow.recurring_id : null,

      isRecurringGenerated: bookingRow.is_recurring_generated as boolean | null | undefined,

      bookingSnapshot: snap,

    });

    if (!rebook.eligible) {

      await markSkipped(supabase, jobId, rebook.reason, jobType);

      void logSystemEvent({

        level: "info",

        source: "processLifecycleJob",

        message: "lifecycle.rebook.skipped",

        context: { jobId, bookingId, jobType, skipReason: rebook.reason },

      });

      return "skipped";

    }

  }



  if (settings.frequencyLimitEnabled) {

    const freq = await evaluateCustomerFrequencyLimit({

      supabase,

      customerEmail: to,

      excludeJobId: jobId,

      jobType,

    });

    if (freq.limited) {

      await markSkipped(supabase, jobId, freq.reason, jobType);

      await logFrequencyLimitSkip({ jobId, bookingId, customerEmail: to });

      return "skipped";

    }

  }



  const { serviceLabel, dateLabel, timeLabel, location } = resolveBookingEmailLabelsFromRow(bookingRow);

  const ctx: LifecycleEmailBookingContext = {

    bookingId,

    to,

    serviceLabel,

    dateLabel,

    timeLabel,

    location,

  };



  if (!settings.emailsEnabled) {

    await revertToPending(supabase, jobId);

    void logSystemEvent({

      level: "info",

      source: "processLifecycleJob",

      message: "lifecycle.paused.would_process",

      context: { jobId, bookingId, jobType, email: to },

    });

    return "skipped";

  }



  if (settings.dryRunEnabled) {

    const preview = buildLifecycleEmailPreview(jobType, ctx);

    await revertToPending(supabase, jobId);

    void logSystemEvent({

      level: "info",

      source: "lifecycle_dry_run",

      message: "Would send lifecycle email",

      context: {

        jobId,

        bookingId,

        jobType,

        email: to,

        subject: preview.subject,

      },

    });

    return "skipped";

  }



  let result: { sent: boolean; error?: string };

  switch (jobType) {

    case "reminder_24h":

      result = await sendReminderEmail(ctx);

      break;

    case "review_request":

      result = await sendReviewEmail(ctx);

      break;

    case "rebook_offer":

      result = await sendRebookEmail(ctx);

      break;

    case "rebook_reminder":

      result = await sendRebookReminderEmail(ctx);

      break;

    default:

      await supabase

        .from("booking_lifecycle_jobs")

        .update({

          status: "failed_terminal",

          last_error: `Unknown job_type: ${jobType}`,

          attempts: TERMINAL_FAILURE_ATTEMPTS,

          processed_at: new Date().toISOString(),

        })

        .eq("id", jobId);

      void incrementLifecycleMetric(supabase, { jobType, outcome: "failed" });

      return "terminal";

  }



  if (result.sent) {

    const { data: updated, error: upErr } = await supabase

      .from("booking_lifecycle_jobs")

      .update({

        status: "sent",

        sent_at: new Date().toISOString(),

        last_error: null,

        skipped_reason: null,

        processed_at: new Date().toISOString(),

      })

      .eq("id", jobId)

      .is("sent_at", null)

      .select("id");



    if (upErr || !updated?.length) {

      await reportOperationalIssue("warn", "processLifecycleJob", "Duplicate send prevented (already sent)", {

        jobId,

        bookingId,

      });

      return "skipped";

    }

    void incrementLifecycleMetric(supabase, { jobType, outcome: "sent" });

    return "sent";

  }



  const nextAttempts = attempts0 + 1;

  const errorClass = classifySendError(result.error);

  const terminal = errorClass === "terminal" || nextAttempts >= TERMINAL_FAILURE_ATTEMPTS;



  await supabase

    .from("booking_lifecycle_jobs")

    .update({

      attempts: nextAttempts,

      last_error: (result.error ?? "send failed").slice(0, 2000),

      status: terminal ? "failed_terminal" : "failed_retryable",

      processed_at: new Date().toISOString(),

    })

    .eq("id", jobId);



  void incrementLifecycleMetric(supabase, { jobType, outcome: "failed" });

  return terminal ? "terminal" : "retry";

}

