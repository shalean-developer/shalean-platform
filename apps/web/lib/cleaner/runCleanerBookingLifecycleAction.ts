import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanerHasBookingAccess } from "@/lib/cleaner/cleanerBookingAccess";
import { ensureBookingAssignment } from "@/lib/dispatch/ensureBookingAssignment";
import { notifyBookingEvent } from "@/lib/notifications/notifyBookingEvent";
import { syncCleanerBusyFromBookings } from "@/lib/cleaner/syncCleanerStatus";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { BOOKING_PAYOUT_COLUMNS_CLEAR } from "@/lib/payout/bookingPayoutColumns";
import { persistCleanerPayoutIfUnset } from "@/lib/payout/persistCleanerPayout";

export type CleanerLifecycleAction = "accept" | "reject" | "en_route" | "start" | "complete";

export type CleanerLifecycleResult = { status: number; json: Record<string, unknown> };

/**
 * Cleaner job state transitions (assigned → in_progress → completed) plus payout on complete.
 * Used by `POST /api/cleaner/jobs/:id` and REST-shaped `/api/cleaner/bookings/:id/*` routes.
 */
export async function runCleanerBookingLifecycleAction(params: {
  admin: SupabaseClient;
  cleanerId: string;
  bookingId: string;
  action: CleanerLifecycleAction;
}): Promise<CleanerLifecycleResult> {
  const { admin, cleanerId, bookingId, action } = params;

  const { data: booking, error: bErr } = await admin
    .from("bookings")
    .select("id, cleaner_id, team_id, is_team_job, status, assignment_attempts")
    .eq("id", bookingId)
    .maybeSingle();

  if (bErr || !booking) {
    return { status: 404, json: { error: "Booking not found." } };
  }

  const bRow = booking as {
    cleaner_id?: string | null;
    team_id?: string | null;
    is_team_job?: boolean | null;
    status?: string | null;
    assignment_attempts?: number | null;
  };
  const canAccess = await cleanerHasBookingAccess(admin, cleanerId, {
    cleaner_id: bRow.cleaner_id ?? null,
    team_id: bRow.team_id ?? null,
    is_team_job: bRow.is_team_job === true,
  });
  if (!canAccess) {
    return { status: 403, json: { error: "Not your job." } };
  }

  const isTeamJob = bRow.is_team_job === true;

  if (isTeamJob && action === "reject") {
    return {
      status: 400,
      json: {
        error: "Team jobs cannot be declined from the app. Contact support if you cannot make this booking.",
      },
    };
  }

  const st = String(bRow.status ?? "").toLowerCase();
  const now = new Date().toISOString();

  if (action === "accept") {
    if (st !== "assigned") {
      return { status: 400, json: { error: "Job is not in assigned state." } };
    }
    await syncCleanerBusyFromBookings(admin, cleanerId);
    return { status: 200, json: { ok: true, status: "assigned" } };
  }

  if (action === "reject") {
    if (st !== "assigned") {
      return { status: 400, json: { error: "You can only reject before starting the job." } };
    }
    const attempts = Number(bRow.assignment_attempts ?? 0);
    const { error: uErr } = await admin
      .from("bookings")
      .update({
        cleaner_id: null,
        status: "pending",
        assigned_at: null,
        en_route_at: null,
        started_at: null,
        assignment_attempts: attempts + 1,
        ...BOOKING_PAYOUT_COLUMNS_CLEAR,
      })
      .eq("id", bookingId);

    if (uErr) {
      return { status: 500, json: { error: uErr.message } };
    }

    await syncCleanerBusyFromBookings(admin, cleanerId);

    const auto = process.env.AUTO_DISPATCH_CLEANERS !== "false";
    if (auto) {
      const r = await ensureBookingAssignment(admin, bookingId, {
        source: "cleaner_job_reject",
        smartAssign: { excludeCleanerIds: [cleanerId] },
      });
      if (!r.ok) {
        await reportOperationalIssue("warn", "cleaner/reject", "Re-dispatch failed", {
          bookingId,
          reason: r.error,
        });
      }
    }

    return { status: 200, json: { ok: true, status: "pending", reassigned: auto } };
  }

  if (action === "en_route") {
    if (st !== "assigned" && st !== "in_progress") {
      return { status: 400, json: { error: "Invalid state for en_route." } };
    }
    const { error: uErr } = await admin.from("bookings").update({ en_route_at: now }).eq("id", bookingId);
    if (uErr) return { status: 500, json: { error: uErr.message } };
    return { status: 200, json: { ok: true, status: st } };
  }

  if (action === "start") {
    if (st !== "assigned") {
      return { status: 400, json: { error: "Start requires assigned state." } };
    }
    const { error: uErr } = await admin
      .from("bookings")
      .update({ status: "in_progress", started_at: now })
      .eq("id", bookingId);
    if (uErr) return { status: 500, json: { error: uErr.message } };
    await syncCleanerBusyFromBookings(admin, cleanerId);
    return { status: 200, json: { ok: true, status: "in_progress" } };
  }

  if (action === "complete") {
    if (st !== "in_progress") {
      return { status: 400, json: { error: "Mark the job as started before completing." } };
    }
    const { error: uErr } = await admin
      .from("bookings")
      .update({ status: "completed", completed_at: now })
      .eq("id", bookingId);

    if (uErr) return { status: 500, json: { error: uErr.message } };

    try {
      const payout = await persistCleanerPayoutIfUnset({ admin, bookingId, cleanerId });
      if (!payout.ok) {
        await reportOperationalIssue("error", "cleaner/jobs/complete", `payout missing after completion: ${payout.error}`, {
          bookingId,
          cleanerId,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("cleaner/jobs/complete persistCleanerPayoutIfUnset", { bookingId, cleanerId, error: msg });
      await reportOperationalIssue("error", "cleaner/jobs/complete", `payout persist threw after completion: ${msg}`, {
        bookingId,
        cleanerId,
      });
    }

    void notifyBookingEvent({ type: "completed", supabase: admin, bookingId });

    const { data: cj } = await admin.from("cleaners").select("jobs_completed").eq("id", cleanerId).maybeSingle();
    const prev = cj && typeof cj === "object" ? Number((cj as { jobs_completed?: number }).jobs_completed ?? 0) : 0;
    await admin.from("cleaners").update({ jobs_completed: prev + 1 }).eq("id", cleanerId);

    await syncCleanerBusyFromBookings(admin, cleanerId);

    const { recordAssignmentOutcomeAndLearn } = await import("@/lib/marketplace-intelligence/assignmentOutcomeFeedback");
    try {
      await recordAssignmentOutcomeAndLearn(admin, bookingId);
    } catch {
      /* learning is best-effort */
    }

    return { status: 200, json: { ok: true, status: "completed" } };
  }

  return { status: 400, json: { error: "Unsupported." } };
}
