import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanerHasBookingAccess } from "@/lib/cleaner/cleanerBookingAccess";
import { ensureBookingAssignment } from "@/lib/dispatch/ensureBookingAssignment";
import { notifyBookingEvent } from "@/lib/notifications/notifyBookingEvent";
import { syncCleanerBusyFromBookings } from "@/lib/cleaner/syncCleanerStatus";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { BOOKING_PAYOUT_COLUMNS_CLEAR } from "@/lib/payout/bookingPayoutColumns";
import {
  fetchBookingDisplayEarningsCents,
  hasPersistedDisplayEarningsBasis,
} from "@/lib/payout/bookingEarningsIntegrity";
import { persistCleanerPayoutIfUnset } from "@/lib/payout/persistCleanerPayout";
import { ensureCleanerEarningsLedgerRow } from "@/lib/payout/ensureCleanerEarningsLedger";
import { newPayoutMoneyPathErrorId } from "@/lib/payout/payoutMoneyPathErrorId";
import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";
import { CLEANER_LIFECYCLE_CODE } from "@/lib/cleaner/cleanerLifecycleErrors";

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
    .select("id, cleaner_id, team_id, is_team_job, status, assignment_attempts, cleaner_response_status, en_route_at")
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
    cleaner_response_status?: string | null;
    en_route_at?: string | null;
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
        code: CLEANER_LIFECYCLE_CODE.TEAM_REJECT_FORBIDDEN,
      },
    };
  }

  const st = String(bRow.status ?? "").toLowerCase();
  const now = new Date().toISOString();

  if (action === "accept") {
    if (st !== "assigned") {
      return {
        status: 400,
        json: { error: "Job is not in assigned state.", code: CLEANER_LIFECYCLE_CODE.NOT_ASSIGNED },
      };
    }
    const resp = String(bRow.cleaner_response_status ?? "")
      .trim()
      .toLowerCase();
    if (resp === CLEANER_RESPONSE.ACCEPTED) {
      await syncCleanerBusyFromBookings(admin, cleanerId);
      return { status: 200, json: { ok: true, status: "assigned", cleaner_response_status: CLEANER_RESPONSE.ACCEPTED } };
    }
    const { error: accErr } = await admin
      .from("bookings")
      .update({ cleaner_response_status: CLEANER_RESPONSE.ACCEPTED })
      .eq("id", bookingId)
      .eq("status", "assigned");
    if (accErr) {
      return { status: 500, json: { error: accErr.message, code: "accept_persist_failed" } };
    }
    await syncCleanerBusyFromBookings(admin, cleanerId);
    return { status: 200, json: { ok: true, status: "assigned", cleaner_response_status: CLEANER_RESPONSE.ACCEPTED } };
  }

  if (action === "reject") {
    if (st !== "assigned") {
      return {
        status: 400,
        json: { error: "You can only reject before starting the job.", code: CLEANER_LIFECYCLE_CODE.NOT_ASSIGNED_FOR_REJECT },
      };
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
        cleaner_response_status: CLEANER_RESPONSE.NONE,
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
    if (st !== "assigned") {
      return {
        status: 400,
        json: { error: "Invalid state for en_route.", code: CLEANER_LIFECYCLE_CODE.INVALID_EN_ROUTE_STATE },
      };
    }
    const rawResp = bRow.cleaner_response_status;
    const r = rawResp == null || rawResp === "" ? "" : String(rawResp).trim().toLowerCase();
    const soloAssigned = !isTeamJob && String(bRow.cleaner_id ?? "").trim() === cleanerId;
    const acceptedForTravel = r === CLEANER_RESPONSE.ACCEPTED || (soloAssigned && r === "");
    if (!acceptedForTravel) {
      return {
        status: 400,
        json: { error: "Accept the job before heading out.", code: CLEANER_LIFECYCLE_CODE.ACCEPT_REQUIRED_BEFORE_TRAVEL },
      };
    }
    const { error: uErr } = await admin.from("bookings").update({ en_route_at: now }).eq("id", bookingId);
    if (uErr) return { status: 500, json: { error: uErr.message } };
    return { status: 200, json: { ok: true, status: st } };
  }

  if (action === "start") {
    if (st !== "assigned") {
      return {
        status: 400,
        json: { error: "Start requires assigned state.", code: CLEANER_LIFECYCLE_CODE.START_REQUIRES_ASSIGNED },
      };
    }
    if (!bRow.en_route_at) {
      return {
        status: 400,
        json: { error: "Mark on the way before starting the job.", code: CLEANER_LIFECYCLE_CODE.EN_ROUTE_REQUIRED_BEFORE_START },
      };
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
      return {
        status: 400,
        json: {
          error: "Mark the job as started before completing.",
          code: CLEANER_LIFECYCLE_CODE.COMPLETE_REQUIRES_IN_PROGRESS,
        },
      };
    }

    try {
      const payout = await persistCleanerPayoutIfUnset({ admin, bookingId, cleanerId });
      if (payout.ok === false) {
        const error_id = newPayoutMoneyPathErrorId();
        await reportOperationalIssue("error", "cleaner/jobs/complete", `payout before completion: ${payout.error}`, {
          bookingId,
          cleanerId,
          error_id,
          code: "payout_persist_failed",
        });
        return {
          status: 500,
          json: {
            error: payout.error ?? "Could not record earnings for this job.",
            code: "payout_persist_failed",
            error_id,
          },
        };
      }
      const displayCents = await fetchBookingDisplayEarningsCents(admin, bookingId);
      if (!hasPersistedDisplayEarningsBasis(displayCents)) {
        const error_id = newPayoutMoneyPathErrorId();
        await reportOperationalIssue("error", "cleaner/jobs/complete", "display_earnings_cents missing after persist (pre-complete verify)", {
          bookingId,
          cleanerId,
          error_id,
          code: "payout_verify_failed",
        });
        return {
          status: 500,
          json: {
            error: "Could not record earnings for this job.",
            code: "payout_verify_failed",
            error_id,
          },
        };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const error_id = newPayoutMoneyPathErrorId();
      await reportOperationalIssue("error", "cleaner/jobs/complete", `payout persist threw before completion: ${msg}`, {
        bookingId,
        cleanerId,
        error_id,
        code: "payout_persist_failed",
      });
      return {
        status: 500,
        json: { error: "Could not record earnings for this job.", code: "payout_persist_failed", error_id },
      };
    }

    const { error: uErr } = await admin
      .from("bookings")
      .update({ status: "completed", completed_at: now })
      .eq("id", bookingId);
    if (!uErr) {
      const led = await ensureCleanerEarningsLedgerRow({ admin, bookingId });
      if (!led.ok) {
        void reportOperationalIssue("warn", "cleaner/jobs/complete", `ensureCleanerEarningsLedgerRow: ${led.error}`, {
          bookingId,
          cleanerId,
        });
      }
    }

    if (uErr) return { status: 500, json: { error: uErr.message } };

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

  return { status: 400, json: { error: "Unsupported.", code: CLEANER_LIFECYCLE_CODE.UNSUPPORTED } };
}
