import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import {
  PAYMENT_RECOVERY_JOB_TYPES,
  PAYMENT_RECOVERY_SCHEDULE_OFFSET_MS,
} from "@/lib/booking/paymentRecoverySkipReasons";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";

export type SchedulePaymentRecoveryJobsParams = {
  bookingId: string;
  customerEmail: string;
  /** Booking `created_at` retained for compatibility/audit. */
  createdAt: string;
  /** Canonical payment-link expiry; terminal customer communication is anchored here when supplied. */
  paymentLinkExpiresAt?: string | null;
};

function parseCreatedAtMs(createdAt: string): number | null {
  const ms = Date.parse(createdAt);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Inserts newly scheduled recovery jobs (idempotent via unique index on booking_id + job_type).\n * Pre-expiry reminders are owned by the TTL-aware payment-link-reminders cron; this scheduler\n * creates only the terminal expiry communication. Historical reminder rows remain processable.
 */
export async function scheduleBookingPaymentRecoveryJobs(
  supabase: SupabaseClient,
  params: SchedulePaymentRecoveryJobsParams,
): Promise<{ ok: boolean }> {
  let email = "";
  try {
    email = params.customerEmail ? normalizeEmail(params.customerEmail) : "";
  } catch {
    email = "";
  }

  if (!email || email.length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: true };
  }

  const baseMs = parseCreatedAtMs(params.createdAt);
  if (baseMs == null) {
    await reportOperationalIssue("warn", "scheduleBookingPaymentRecoveryJobs", "Invalid createdAt; skipping", {
      bookingId: params.bookingId,
    });
    return { ok: true };
  }

  let ok = true;
  for (const jobType of PAYMENT_RECOVERY_JOB_TYPES) {
    const offset = PAYMENT_RECOVERY_SCHEDULE_OFFSET_MS[jobType];
    const expiryMs =
      jobType === "booking_payment_expired" && params.paymentLinkExpiresAt
        ? Date.parse(params.paymentLinkExpiresAt)
        : NaN;
    const scheduledFor = new Date(
      Number.isFinite(expiryMs) ? expiryMs : baseMs + offset,
    ).toISOString();
    const { error } = await supabase.from("booking_payment_recovery_jobs").insert({
      booking_id: params.bookingId,
      customer_email: email,
      job_type: jobType,
      scheduled_for: scheduledFor,
      status: "pending",
      attempts: 0,
    });
    if (error && error.code !== "23505") {
      ok = false;
      await reportOperationalIssue("warn", "scheduleBookingPaymentRecoveryJobs", error.message, {
        bookingId: params.bookingId,
        jobType,
        code: error.code,
      });
    }
  }

  if (!ok) {
    await logSystemEvent({
      level: "error",
      source: "payment_recovery",
      message: "Payment recovery job scheduling failed",
      context: { bookingId: params.bookingId },
    });
  }

  return { ok };
}
