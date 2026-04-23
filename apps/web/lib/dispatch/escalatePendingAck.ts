import { assignCleanerToBooking } from "@/lib/dispatch/assignCleaner";
import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";
import { notifyCleanerAssignedBooking } from "@/lib/dispatch/notifyCleanerAssigned";
import {
  logAssignmentSuccess,
  verifyBookingAssignmentExpectsCleaner,
  verifyCleanerJobRowVisibleWithRetry,
} from "@/lib/booking/verifyBookingAssignment";
import { BOOKING_PAYOUT_COLUMNS_CLEAR } from "@/lib/payout/bookingPayoutColumns";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Wall-clock wait before treating `pending` ack as missed (cron granularity applies). */
export const PENDING_ACK_ESCALATE_MS = 30_000;

const MAX_DISPATCH_ESCALATIONS = 15;

export type EscalateResult =
  | { ok: true; action: "skipped" | "reassigned" | "exhausted_failed"; detail?: string }
  | { ok: false; error: string };

/**
 * If a booking is assigned but the cleaner never acknowledged within the window,
 * clear assignment and run one auto-dispatch pass (next cleaner from existing engine).
 * Uses conditional update on `cleaner_response_status=pending` to avoid races with accept().
 */
export async function escalateBookingIfAckTimeout(
  admin: SupabaseClient,
  bookingId: string,
): Promise<EscalateResult> {
  const { data: b, error: bErr } = await admin
    .from("bookings")
    .select("id, cleaner_id, assigned_at, cleaner_response_status, dispatch_attempts, status, dispatch_status")
    .eq("id", bookingId)
    .maybeSingle();

  if (bErr || !b) {
    return { ok: false, error: bErr?.message ?? "Booking not found" };
  }

  const row = b as {
    cleaner_id?: string | null;
    assigned_at?: string | null;
    cleaner_response_status?: string | null;
    dispatch_attempts?: number | null;
    status?: string | null;
    dispatch_status?: string | null;
  };

  const response = String(row.cleaner_response_status ?? "").toLowerCase();
  if (response !== CLEANER_RESPONSE.PENDING) {
    return { ok: true, action: "skipped", detail: `response=${response || "none"}` };
  }

  const assignedAt = row.assigned_at ? new Date(row.assigned_at).getTime() : 0;
  if (!assignedAt || Number.isNaN(assignedAt)) {
    return { ok: true, action: "skipped", detail: "no_assigned_at" };
  }

  if (Date.now() - assignedAt < PENDING_ACK_ESCALATE_MS) {
    return { ok: true, action: "skipped", detail: "within_ack_window" };
  }

  const st = String(row.status ?? "").toLowerCase();
  const ds = String(row.dispatch_status ?? "").toLowerCase();
  if (st !== "assigned" || ds !== "assigned") {
    return { ok: true, action: "skipped", detail: `state=${st}/${ds}` };
  }

  const prevCleaner = row.cleaner_id != null ? String(row.cleaner_id) : "";
  const nextAttempts = Math.min(MAX_DISPATCH_ESCALATIONS, Number(row.dispatch_attempts ?? 0) + 1);

  if (nextAttempts >= MAX_DISPATCH_ESCALATIONS) {
    const { error: failErr } = await admin
      .from("bookings")
      .update({
        cleaner_id: null,
        status: "pending",
        dispatch_status: "failed",
        assigned_at: null,
        cleaner_response_status: CLEANER_RESPONSE.NONE,
        dispatch_attempts: nextAttempts,
        ...BOOKING_PAYOUT_COLUMNS_CLEAR,
      })
      .eq("id", bookingId)
      .eq("cleaner_response_status", CLEANER_RESPONSE.PENDING);

    if (failErr) {
      return { ok: false, error: failErr.message };
    }

    void logSystemEvent({
      level: "error",
      source: "DISPATCH_ESCALATION_EXHAUSTED",
      message: "No cleaner accepted after max escalation rounds",
      context: { bookingId, dispatch_attempts: nextAttempts },
    });
    await reportOperationalIssue("error", "dispatch/escalate", "DISPATCH_ESCALATION_EXHAUSTED", {
      bookingId,
      dispatch_attempts: nextAttempts,
    });
    return { ok: true, action: "exhausted_failed" };
  }

  const { data: cleared, error: clearErr } = await admin
    .from("bookings")
    .update({
      cleaner_id: null,
      status: "pending",
      dispatch_status: "searching",
      assigned_at: null,
      cleaner_response_status: CLEANER_RESPONSE.NONE,
      dispatch_attempts: nextAttempts,
      ...BOOKING_PAYOUT_COLUMNS_CLEAR,
    })
    .eq("id", bookingId)
    .eq("cleaner_response_status", CLEANER_RESPONSE.PENDING)
    .select("id");

  if (clearErr) {
    return { ok: false, error: clearErr.message };
  }
  if (!cleared?.length) {
    return { ok: true, action: "skipped", detail: "concurrent_accept_or_clear" };
  }

  void logSystemEvent({
    level: "warn",
    source: "DISPATCH_ACK_TIMEOUT",
    message: "Cleaner did not acknowledge in time — re-dispatching",
    context: { bookingId, previous_cleaner_id: prevCleaner, dispatch_attempts: nextAttempts },
  });

  const auto = process.env.AUTO_DISPATCH_CLEANERS !== "false";
  if (!auto) {
    return { ok: true, action: "reassigned", detail: "cleared_auto_dispatch_off" };
  }

  const r = await assignCleanerToBooking(admin, bookingId);
  if (!r.ok) {
    if (r.error === "no_candidate") {
      void logSystemEvent({
        level: "info",
        source: "NO_CANDIDATE",
        message: "Post-timeout re-dispatch: no candidate",
        context: { bookingId },
      });
    } else {
      await reportOperationalIssue("warn", "dispatch/escalate", `re-dispatch failed: ${r.error}`, {
        bookingId,
        detail: r.message ?? null,
      });
    }
    return { ok: true, action: "reassigned", detail: r.error };
  }

  try {
    await verifyBookingAssignmentExpectsCleaner(admin, bookingId, r.cleanerId);
    await verifyCleanerJobRowVisibleWithRetry(admin, bookingId, r.cleanerId);
    logAssignmentSuccess({ bookingId, cleanerId: r.cleanerId, source: "dispatch/escalate:reassign" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await reportOperationalIssue("error", "dispatch/escalate", `post-reassign verify: ${msg}`, {
      bookingId,
      cleanerId: r.cleanerId,
    });
  }

  await notifyCleanerAssignedBooking(admin, bookingId, r.cleanerId);
  return { ok: true, action: "reassigned" };
}
