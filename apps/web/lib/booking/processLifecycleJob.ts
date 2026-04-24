import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceLabel } from "@/components/booking/serviceCategories";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import {
  sendReminderEmail,
  sendReviewEmail,
  sendRebookEmail,
  sendRebookReminderEmail,
  type LifecycleEmailBookingContext,
} from "@/lib/email/lifecycleEmails";
import { reportOperationalIssue } from "@/lib/logging/systemLog";

export type LifecycleJobRow = {
  id: string;
  booking_id: string;
  job_type: string;
  customer_email: string;
  attempts: number | null;
};

export type ProcessLifecycleResult = "sent" | "skipped" | "retry" | "terminal";

const TERMINAL_FAILURE_ATTEMPTS = 5;
const PAUSE_MAIN_CRON_AFTER_ATTEMPTS = 3;

function afterSendFailure(
  attempts: number,
): { nextAttempts: number; status: "pending" | "failed"; terminal: boolean } {
  const nextAttempts = attempts + 1;
  const terminal = nextAttempts >= TERMINAL_FAILURE_ATTEMPTS;
  const pauseMain = nextAttempts >= PAUSE_MAIN_CRON_AFTER_ATTEMPTS;
  return {
    nextAttempts,
    status: terminal || pauseMain ? "failed" : "pending",
    terminal,
  };
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

  const attempts0 = typeof fresh.attempts === "number" ? fresh.attempts : 0;

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
        status: "failed",
        last_error: "Invalid email",
        attempts: TERMINAL_FAILURE_ATTEMPTS,
      })
      .eq("id", jobId);
    await reportOperationalIssue("warn", "processLifecycleJob", "Invalid customer email", { jobId, bookingId });
    return "terminal";
  }

  const { data: booking, error: bErr } = await supabase
    .from("bookings")
    .select("id, service, booking_snapshot, location, status")
    .eq("id", bookingId)
    .maybeSingle();

  if (bErr || !booking) {
    const { nextAttempts, status, terminal } = afterSendFailure(attempts0);
    await supabase
      .from("booking_lifecycle_jobs")
      .update({
        attempts: nextAttempts,
        last_error: "Booking not found",
        status,
      })
      .eq("id", jobId);
    await reportOperationalIssue("warn", "processLifecycleJob", `Booking missing: ${bErr?.message ?? "none"}`, {
      jobId,
      bookingId,
    });
    return terminal ? "terminal" : "retry";
  }

  const bookingStatus = String((booking as { status?: string | null }).status ?? "").toLowerCase();
  if (bookingStatus === "cancelled") {
    await supabase
      .from("booking_lifecycle_jobs")
      .update({ status: "cancelled", last_error: null })
      .eq("id", jobId);
    return "skipped";
  }

  const snap = booking.booking_snapshot as BookingSnapshotV1 | null;
  let serviceLabel = typeof booking.service === "string" ? booking.service : "Cleaning service";
  if (snap?.locked?.service != null) serviceLabel = getServiceLabel(snap.locked.service);

  let dateLabel = "—";
  let timeLabel = "—";
  const locked = snap?.locked;
  if (locked?.date) {
    const [y, m, d] = locked.date.split("-").map(Number);
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
      dateLabel = new Date(y, m - 1, d).toLocaleDateString("en-ZA", {
        weekday: "long",
        day: "numeric",
        month: "short",
      });
    }
  }
  if (locked?.time) timeLabel = locked.time;
  const location =
    locked?.location?.trim() ||
    (typeof booking.location === "string" ? booking.location : "") ||
    "";

  const ctx: LifecycleEmailBookingContext = {
    bookingId,
    to,
    serviceLabel,
    dateLabel,
    timeLabel,
    location,
  };

  let result: { sent: boolean; error?: string };
  switch (row.job_type) {
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
          status: "failed",
          last_error: `Unknown job_type: ${row.job_type}`,
          attempts: TERMINAL_FAILURE_ATTEMPTS,
        })
        .eq("id", jobId);
      return "terminal";
  }

  if (result.sent) {
    const { data: updated, error: upErr } = await supabase
      .from("booking_lifecycle_jobs")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        last_error: null,
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
    return "sent";
  }

  const { nextAttempts, status, terminal } = afterSendFailure(attempts0);
  await supabase
    .from("booking_lifecycle_jobs")
    .update({
      attempts: nextAttempts,
      last_error: (result.error ?? "send failed").slice(0, 2000),
      status,
    })
    .eq("id", jobId);

  return terminal ? "terminal" : "retry";
}
