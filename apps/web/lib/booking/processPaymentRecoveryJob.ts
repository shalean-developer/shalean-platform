import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import {
  classifySendError,
  evaluatePaymentRecoveryJobEligibility,
  TERMINAL_FAILURE_ATTEMPTS,
} from "@/lib/booking/paymentRecoveryEmailGuards";
import type { PaymentRecoveryJobType } from "@/lib/booking/paymentRecoverySkipReasons";
import {
  buildPaymentRecoveryEmailContext,
  sendPaymentRecoveryEmail,
} from "@/lib/email/paymentRecoveryEmails";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";

export type PaymentRecoveryJobRow = {
  id: string;
  booking_id: string;
  job_type: string;
  customer_email: string;
  attempts: number | null;
};

export type ProcessPaymentRecoveryResult = "sent" | "skipped" | "retry" | "terminal";

async function markSkipped(
  supabase: SupabaseClient,
  jobId: string,
  reason: string,
): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from("booking_payment_recovery_jobs")
    .update({
      status: "skipped",
      skipped_reason: reason.slice(0, 500),
      processed_at: now,
      last_error: null,
      updated_at: now,
    })
    .eq("id", jobId);
}

async function markCancelled(supabase: SupabaseClient, jobId: string, reason: string): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from("booking_payment_recovery_jobs")
    .update({
      status: "cancelled",
      last_error: reason.slice(0, 500),
      processed_at: now,
      updated_at: now,
    })
    .eq("id", jobId);
}

async function claimJobForProcessing(
  supabase: SupabaseClient,
  jobId: string,
): Promise<{ ok: true; attempts: number } | { ok: false }> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("booking_payment_recovery_jobs")
    .update({ status: "processing", processed_at: now, updated_at: now })
    .eq("id", jobId)
    .in("status", ["pending", "failed_retryable"])
    .select("attempts")
    .maybeSingle();

  if (error || !data) return { ok: false };
  return { ok: true, attempts: typeof data.attempts === "number" ? data.attempts : 0 };
}

/**
 * Sends one payment recovery email. Idempotent: skips if already sent.
 */
export async function processPaymentRecoveryJob(
  supabase: SupabaseClient,
  row: PaymentRecoveryJobRow,
): Promise<ProcessPaymentRecoveryResult> {
  const jobId = row.id;
  const bookingId = row.booking_id;
  const jobType = row.job_type;

  const { data: fresh, error: freshErr } = await supabase
    .from("booking_payment_recovery_jobs")
    .select("sent_at, status, attempts")
    .eq("id", jobId)
    .maybeSingle();

  if (freshErr || !fresh) {
    await reportOperationalIssue("warn", "processPaymentRecoveryJob", `Job row missing: ${freshErr?.message}`, { jobId });
    return "skipped";
  }

  if (fresh.sent_at || fresh.status === "sent") return "skipped";
  if (fresh.status === "processing") return "skipped";

  const claim = await claimJobForProcessing(supabase, jobId);
  if (!claim.ok) return "skipped";

  const attempts0 = claim.attempts;

  let to = "";
  try {
    to = row.customer_email?.trim() ? normalizeEmail(row.customer_email) : "";
  } catch {
    to = "";
  }

  if (!to || to.length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    await supabase
      .from("booking_payment_recovery_jobs")
      .update({
        status: "failed_terminal",
        last_error: "Invalid email",
        attempts: TERMINAL_FAILURE_ATTEMPTS,
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    await reportOperationalIssue("warn", "processPaymentRecoveryJob", "Invalid customer email", { jobId, bookingId });
    return "terminal";
  }

  const { data: booking, error: bErr } = await supabase
    .from("bookings")
    .select(
      "id, service, booking_snapshot, status, customer_email, customer_name, date, time, total_paid_zar, total_price, payment_status, amount_paid_cents, total_paid_cents, paid_at, paystack_reference, payment_link",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (bErr || !booking) {
    const nextAttempts = attempts0 + 1;
    const terminal = nextAttempts >= TERMINAL_FAILURE_ATTEMPTS;
    await supabase
      .from("booking_payment_recovery_jobs")
      .update({
        attempts: nextAttempts,
        last_error: "Booking not found",
        status: terminal ? "failed_terminal" : "failed_retryable",
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    await reportOperationalIssue("warn", "processPaymentRecoveryJob", `Booking missing: ${bErr?.message ?? "none"}`, {
      jobId,
      bookingId,
    });
    return terminal ? "terminal" : "retry";
  }

  const bookingRow = booking as Record<string, unknown>;
  const eligibility = evaluatePaymentRecoveryJobEligibility(bookingRow, jobType);
  if (!eligibility.eligible) {
    if (eligibility.action === "cancel") {
      await markCancelled(supabase, jobId, eligibility.reason);
    } else {
      await markSkipped(supabase, jobId, eligibility.reason);
    }
    void logSystemEvent({
      level: "info",
      source: "processPaymentRecoveryJob",
      message: "payment_recovery.skipped",
      context: { jobId, bookingId, jobType, skipReason: eligibility.reason },
    });
    return "skipped";
  }

  const ctx = buildPaymentRecoveryEmailContext(bookingRow);
  if (!ctx) {
    await markSkipped(supabase, jobId, "missing_booking_context");
    return "skipped";
  }
  ctx.to = to;

  const result = await sendPaymentRecoveryEmail(jobType as PaymentRecoveryJobType, ctx);

  if (result.sent) {
    const { data: updated, error: upErr } = await supabase
      .from("booking_payment_recovery_jobs")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        last_error: null,
        skipped_reason: null,
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .is("sent_at", null)
      .select("id");

    if (upErr || !updated?.length) {
      await reportOperationalIssue("warn", "processPaymentRecoveryJob", "Duplicate send prevented (already sent)", {
        jobId,
        bookingId,
      });
      return "skipped";
    }
    return "sent";
  }

  const nextAttempts = attempts0 + 1;
  const errorClass = classifySendError(result.error);
  const terminal = errorClass === "terminal" || nextAttempts >= TERMINAL_FAILURE_ATTEMPTS;

  await supabase
    .from("booking_payment_recovery_jobs")
    .update({
      attempts: nextAttempts,
      last_error: (result.error ?? "send failed").slice(0, 2000),
      status: terminal ? "failed_terminal" : "failed_retryable",
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  return terminal ? "terminal" : "retry";
}
