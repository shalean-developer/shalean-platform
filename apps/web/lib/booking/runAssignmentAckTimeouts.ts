import "server-only";

import { tryOnceReassignAfterDecline } from "@/lib/booking/reassignBookingAfterDecline";
import { releaseAssignedBookingAfterAckTimeout } from "@/lib/booking/assignmentBookingStateCommands";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getSmsOutboundDecision } from "@/lib/notifications/communicationPolicy";
import type { SupabaseClient } from "@supabase/supabase-js";

/** No accept/decline after this many minutes → release cleaner and try one reassignment. */
export const ASSIGNMENT_ACK_TIMEOUT_MINUTES = 10;

const MAX_BATCH = 40;

type StaleAssignedRow = {
  id: string;
  date: string | null;
  time: string | null;
  cleaner_id: string | null;
};

export type AssignmentAckTimeoutCandidateRow = {
  is_team_job?: boolean | null;
  is_recurring_generated?: boolean | null;
  is_monthly_billing_booking?: boolean | null;
  billing_type?: string | null;
  assignment_type?: string | null;
};

/**
 * Recurring continuity assigns direct-assign the preferred cleaner — no dispatch offer / accept step.
 * Applies to monthly invoice rows and per-booking Paystack recurring alike.
 */
export function shouldSkipAssignmentAckTimeout(row: AssignmentAckTimeoutCandidateRow): boolean {
  if (row.is_team_job === true) return true;
  if (row.is_recurring_generated !== true) return false;
  return (
    String(row.assignment_type ?? "")
      .trim()
      .toLowerCase() === "user_selected"
  );
}

const SMS_DEGRADED_WINDOW_MS = 2 * 3600_000;
const SMS_DEGRADED_MIN_ATTEMPTS = 5;
const SMS_DEGRADED_FAIL_RATE = 0.8;

function smsAuthFailure(error: string | null | undefined): boolean {
  const e = String(error ?? "").toLowerCase();
  return e.includes("twilio_auth") || e.includes("twilio_401") || e.includes("authenticate");
}

/**
 * When cleaner SMS is enabled but Twilio is misconfigured or failing auth, pause ack timeout so
 * assignments are not released before cleaners can see in-app offers.
 */
export async function shouldPauseAssignmentAckTimeoutForSms(
  admin: SupabaseClient,
): Promise<{ paused: boolean; reason?: string }> {
  if (process.env.ASSIGNMENT_ACK_TIMEOUT_PAUSE_WHEN_SMS_DEGRADED === "false") {
    return { paused: false };
  }

  const cleanerSms = getSmsOutboundDecision("cleaner");
  if (!cleanerSms.allowed) return { paused: false };

  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_PHONE_NUMBER?.trim() || process.env.TWILIO_FROM_NUMBER?.trim();
  if (!sid || !token || !from) {
    return { paused: true, reason: "twilio_not_configured" };
  }

  const sinceIso = new Date(Date.now() - SMS_DEGRADED_WINDOW_MS).toISOString();
  const { data, error } = await admin
    .from("notification_logs")
    .select("status, error")
    .eq("channel", "sms")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(40);

  if (error || !data?.length) return { paused: false };

  let failed = 0;
  let authFailed = 0;
  for (const row of data) {
    if (String(row.status ?? "") === "failed") {
      failed++;
      if (smsAuthFailure(row.error as string | null)) authFailed++;
    }
  }
  const attempts = data.length;
  if (authFailed >= SMS_DEGRADED_MIN_ATTEMPTS) {
    return { paused: true, reason: "twilio_auth_failures" };
  }
  if (attempts >= SMS_DEGRADED_MIN_ATTEMPTS && failed / attempts >= SMS_DEGRADED_FAIL_RATE) {
    return { paused: true, reason: "sms_failure_rate_high" };
  }
  return { paused: false };
}

export type AssignmentAckTimeoutRunResult = {
  processed: number;
  errors: number;
  skipped?: boolean;
  skipReason?: string;
};

/**
 * Finds `assigned` bookings whose `assigned_at` is older than {@link ASSIGNMENT_ACK_TIMEOUT_MINUTES},
 * moves each to `pending_assignment` / `unassigned`, then runs one reassignment attempt (excluding prior cleaner).
 */
export async function runAssignmentAckTimeouts(admin: SupabaseClient): Promise<AssignmentAckTimeoutRunResult> {
  const smsPause = await shouldPauseAssignmentAckTimeoutForSms(admin);
  if (smsPause.paused) {
    await logSystemEvent({
      level: "info",
      source: "assignment_ack_timeout",
      message: "Paused — SMS delivery degraded",
      context: { reason: smsPause.reason ?? "unknown" },
    });
    return { processed: 0, errors: 0, skipped: true, skipReason: smsPause.reason };
  }

  const cutoff = new Date(Date.now() - ASSIGNMENT_ACK_TIMEOUT_MINUTES * 60 * 1000).toISOString();

  const { data: rows, error: selErr } = await admin
    .from("bookings")
    .select(
      "id, date, time, cleaner_id, status, assigned_at, cleaner_response_status, is_team_job, is_recurring_generated, is_monthly_billing_booking, billing_type, assignment_type",
    )
    .eq("status", "assigned")
    .not("assigned_at", "is", null)
    .lt("assigned_at", cutoff)
    .or("cleaner_response_status.is.null,cleaner_response_status.eq.none,cleaner_response_status.eq.pending")
    .limit(MAX_BATCH);

  if (selErr || !rows?.length) {
    if (selErr) {
      await logSystemEvent({
        level: "warn",
        source: "assignment_ack_timeout",
        message: "Failed to load stale assigned bookings",
        context: { message: selErr.message },
      });
    }
    return { processed: 0, errors: selErr ? 1 : 0 };
  }

  let processed = 0;
  let errors = 0;

  for (const raw of rows) {
    const row = raw as StaleAssignedRow & AssignmentAckTimeoutCandidateRow;
    if (shouldSkipAssignmentAckTimeout(row)) continue;
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) continue;

    const prevCleaner = typeof row.cleaner_id === "string" && row.cleaner_id ? row.cleaner_id : "";

    const { data: updated, error: upErr } = await releaseAssignedBookingAfterAckTimeout({
      admin,
      bookingId: id,
      patch: {
        status: "pending_assignment",
        dispatch_status: "unassigned",
        cleaner_id: null,
        assigned_at: null,
        last_declined_by_cleaner_id: null,
        last_declined_at: null,
      },
    });

    if (upErr || !updated) {
      if (upErr) errors += 1;
      continue;
    }

    processed += 1;

    await logSystemEvent({
      level: "info",
      source: "assignment_ack_timeout",
      message: "Released assigned booking after ack timeout",
      context: {
        bookingId: id,
        previousCleanerId: prevCleaner || null,
        timeoutMinutes: ASSIGNMENT_ACK_TIMEOUT_MINUTES,
      },
    });

    const slotDate = String(row.date ?? "").trim();
    const slotTime = String(row.time ?? "").trim();
    await tryOnceReassignAfterDecline(admin, {
      bookingId: id,
      slotDate,
      slotTime,
      declinedCleanerId: prevCleaner,
    });
  }

  return { processed, errors };
}
