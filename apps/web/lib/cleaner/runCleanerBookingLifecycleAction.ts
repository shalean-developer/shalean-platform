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
import { assignedOfferPastAcceptanceDeadline } from "@/lib/cleaner/cleanerAssignedOfferExpiry";
import { cleanerResponseAllowsProgression } from "@/lib/cleaner/cleanerResponseProgression";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { isCleanerAssignmentAccepted } from "@/lib/cleaner/cleanerMobileBookingMap";

export type CleanerLifecycleAction = "accept" | "reject" | "en_route" | "start" | "complete";

export type CleanerLifecycleResult = { status: number; json: Record<string, unknown> };

/** Post-payment operational rows may still be `confirmed` in legacy data; treat like `assigned` for lifecycle. */
function isAssignedLikeStatus(status: string | null | undefined): boolean {
  const s = String(status ?? "")
    .trim()
    .toLowerCase();
  return s === "assigned" || s === "confirmed";
}

/**
 * Accept-related updates: optimistic lock on `assigned` or legacy `confirmed`. PostgREST does not error when
 * zero rows match — callers must inspect returned rows.
 */
async function updateAssignedBookingOrFail(params: {
  admin: SupabaseClient;
  bookingId: string;
  patch: Record<string, unknown>;
}): Promise<{ ok: true } | { ok: false; message: string; code: string }> {
  const { data, error } = await params.admin
    .from("bookings")
    .update(params.patch)
    .eq("id", params.bookingId)
    .in("status", ["assigned", "confirmed"])
    .select("id");
  if (error) {
    return { ok: false, message: error.message, code: "accept_persist_failed" };
  }
  if (!data?.length) {
    return {
      ok: false,
      message: "Could not save acceptance — the booking changed or was updated elsewhere. Refresh the page and try again.",
      code: CLEANER_LIFECYCLE_CODE.ACCEPT_UPDATE_NO_ROW,
    };
  }
  return { ok: true };
}

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
    .select(
      "id, cleaner_id, payout_owner_cleaner_id, team_id, is_team_job, status, date, time, assignment_attempts, cleaner_response_status, accepted_at, dispatch_status, en_route_at",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (bErr || !booking) {
    return { status: 404, json: { error: "Booking not found." } };
  }

  const bRow = booking as {
    id?: string;
    cleaner_id?: string | null;
    payout_owner_cleaner_id?: string | null;
    team_id?: string | null;
    is_team_job?: boolean | null;
    status?: string | null;
    date?: string | null;
    time?: string | null;
    assignment_attempts?: number | null;
    cleaner_response_status?: string | null;
    accepted_at?: string | null;
    dispatch_status?: string | null;
    en_route_at?: string | null;
  };
  const canAccess = await cleanerHasBookingAccess(admin, cleanerId, {
    id: bRow.id ?? bookingId,
    cleaner_id: bRow.cleaner_id ?? null,
    payout_owner_cleaner_id: bRow.payout_owner_cleaner_id ?? null,
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
    if (!isAssignedLikeStatus(bRow.status)) {
      return {
        status: 400,
        json: { error: "Job is not in assigned state.", code: CLEANER_LIFECYCLE_CODE.NOT_ASSIGNED },
      };
    }
    let resp = String(bRow.cleaner_response_status ?? "")
      .trim()
      .toLowerCase();
    let acceptedAt = String(bRow.accepted_at ?? "").trim();
    let dispatchLower = String(bRow.dispatch_status ?? "").trim().toLowerCase();

    /** Narrow DB self-heal: `accepted_at` written but response column still pre-accept (never widen from declined/started). */
    const orphanAcceptedAt =
      Boolean(acceptedAt) &&
      resp !== CLEANER_RESPONSE.ACCEPTED &&
      (resp === "" || resp === CLEANER_RESPONSE.NONE || resp === CLEANER_RESPONSE.PENDING);
    if (orphanAcceptedAt) {
      const heal: Record<string, unknown> = { cleaner_response_status: CLEANER_RESPONSE.ACCEPTED };
      if (dispatchLower === "offered") heal.dispatch_status = "assigned";
      if (st === "confirmed") heal.status = "assigned";
      const healRes = await updateAssignedBookingOrFail({ admin, bookingId, patch: heal });
      if (healRes.ok) {
        bRow.cleaner_response_status = CLEANER_RESPONSE.ACCEPTED;
        if (dispatchLower === "offered") bRow.dispatch_status = "assigned";
        resp = CLEANER_RESPONSE.ACCEPTED;
        dispatchLower = String(heal.dispatch_status ?? bRow.dispatch_status ?? "").trim().toLowerCase();
      } else if (healRes.code === CLEANER_LIFECYCLE_CODE.ACCEPT_UPDATE_NO_ROW) {
        void reportOperationalIssue("warn", "cleaner/jobs/accept", "accept_heal_zero_rows", {
          bookingId,
          cleanerId,
          code: healRes.code,
        });
      }
    }

    if (resp === CLEANER_RESPONSE.ACCEPTED) {
      const patch: Record<string, unknown> = {};
      if (!acceptedAt) patch.accepted_at = now;
      if (dispatchLower === "offered") patch.dispatch_status = "assigned";
      if (st === "confirmed") patch.status = "assigned";
      if (Object.keys(patch).length > 0) {
        const patchRes = await updateAssignedBookingOrFail({ admin, bookingId, patch });
        if (!patchRes.ok) {
          const stHttp = patchRes.code === CLEANER_LIFECYCLE_CODE.ACCEPT_UPDATE_NO_ROW ? 412 : 500;
          if (patchRes.code === CLEANER_LIFECYCLE_CODE.ACCEPT_UPDATE_NO_ROW) {
            void reportOperationalIssue("warn", "cleaner/jobs/accept", "accept_patch_zero_rows", {
              bookingId,
              cleanerId,
            });
          }
          return { status: stHttp, json: { error: patchRes.message, code: patchRes.code } };
        }
      }
      await syncCleanerBusyFromBookings(admin, cleanerId);
      return { status: 200, json: { ok: true, status: "assigned", cleaner_response_status: CLEANER_RESPONSE.ACCEPTED } };
    }
    if (
      assignedOfferPastAcceptanceDeadline({
        status: bRow.status ?? null,
        cleaner_response_status: bRow.cleaner_response_status ?? null,
        date: bRow.date ?? null,
        time: bRow.time ?? null,
        accepted_at: bRow.accepted_at ?? null,
      })
    ) {
      return {
        status: 400,
        json: {
          error: "This job is no longer available — the scheduled time has passed.",
          code: CLEANER_LIFECYCLE_CODE.ACCEPT_OFFER_EXPIRED,
        },
      };
    }
    if (resp === CLEANER_RESPONSE.ON_MY_WAY || resp === CLEANER_RESPONSE.STARTED) {
      await syncCleanerBusyFromBookings(admin, cleanerId);
      return {
        status: 200,
        json: {
          ok: true,
          status: "assigned",
          cleaner_response_status: String(bRow.cleaner_response_status ?? resp),
        },
      };
    }
    if (!cleanerResponseAllowsProgression(resp, CLEANER_RESPONSE.ACCEPTED, { allowEqual: true })) {
      await syncCleanerBusyFromBookings(admin, cleanerId);
      return {
        status: 200,
        json: {
          ok: true,
          duplicate: true,
          status: "assigned",
          cleaner_response_status: String(bRow.cleaner_response_status ?? resp),
        },
      };
    }
    const acceptPayload: Record<string, unknown> = {
      cleaner_response_status: CLEANER_RESPONSE.ACCEPTED,
      accepted_at: now,
    };
    if (st === "confirmed") {
      acceptPayload.status = "assigned";
    }
    if (dispatchLower === "offered") {
      acceptPayload.dispatch_status = "assigned";
    }
    const accRes = await updateAssignedBookingOrFail({ admin, bookingId, patch: acceptPayload });
    if (!accRes.ok) {
      const stHttp = accRes.code === CLEANER_LIFECYCLE_CODE.ACCEPT_UPDATE_NO_ROW ? 412 : 500;
      if (accRes.code === CLEANER_LIFECYCLE_CODE.ACCEPT_UPDATE_NO_ROW) {
        void reportOperationalIssue("warn", "cleaner/jobs/accept", "accept_primary_zero_rows", {
          bookingId,
          cleanerId,
          cleaner_response_status: resp,
        });
      }
      return { status: stHttp, json: { error: accRes.message, code: accRes.code } };
    }
    await syncCleanerBusyFromBookings(admin, cleanerId);
    return { status: 200, json: { ok: true, status: "assigned", cleaner_response_status: CLEANER_RESPONSE.ACCEPTED } };
  }

  if (action === "reject") {
    if (!isAssignedLikeStatus(bRow.status)) {
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
        accepted_at: null,
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
    if (!isAssignedLikeStatus(bRow.status)) {
      return {
        status: 400,
        json: { error: "Invalid state for en_route.", code: CLEANER_LIFECYCLE_CODE.INVALID_EN_ROUTE_STATE },
      };
    }
    /** Match job UI / accept path: `accepted_at` counts as committed even if `cleaner_response_status` lags. */
    const acceptedForTravel = isCleanerAssignmentAccepted({
      id: bookingId,
      service: null,
      date: bRow.date ?? null,
      time: bRow.time ?? null,
      location: null,
      status: bRow.status ?? null,
      total_paid_zar: null,
      customer_name: null,
      customer_phone: null,
      assigned_at: null,
      en_route_at: null,
      started_at: null,
      completed_at: null,
      created_at: null,
      cleaner_response_status: bRow.cleaner_response_status ?? null,
      accepted_at: bRow.accepted_at ?? null,
    } as CleanerBookingRow);
    if (!acceptedForTravel) {
      return {
        status: 400,
        json: { error: "Accept the job before heading out.", code: CLEANER_LIFECYCLE_CODE.ACCEPT_REQUIRED_BEFORE_TRAVEL },
      };
    }
    if (!cleanerResponseAllowsProgression(String(bRow.cleaner_response_status ?? ""), CLEANER_RESPONSE.ON_MY_WAY)) {
      return { status: 200, json: { ok: true, duplicate: true, status: st } };
    }
    const enRoutePatch: Record<string, unknown> = {
      en_route_at: now,
      cleaner_response_status: CLEANER_RESPONSE.ON_MY_WAY,
    };
    if (st === "confirmed") enRoutePatch.status = "assigned";
    const { error: uErr } = await admin.from("bookings").update(enRoutePatch).eq("id", bookingId);
    if (uErr) return { status: 500, json: { error: uErr.message } };
    return { status: 200, json: { ok: true, status: st === "confirmed" ? "assigned" : st } };
  }

  if (action === "start") {
    if (!isAssignedLikeStatus(bRow.status)) {
      return {
        status: 400,
        json: { error: "Start requires assigned state.", code: CLEANER_LIFECYCLE_CODE.START_REQUIRES_ASSIGNED },
      };
    }
    const startResp = String(bRow.cleaner_response_status ?? "")
      .trim()
      .toLowerCase();
    const travelAcked = Boolean(bRow.en_route_at) || startResp === CLEANER_RESPONSE.ON_MY_WAY;
    if (!travelAcked) {
      return {
        status: 400,
        json: { error: "Mark on the way before starting the job.", code: CLEANER_LIFECYCLE_CODE.EN_ROUTE_REQUIRED_BEFORE_START },
      };
    }
    if (!cleanerResponseAllowsProgression(startResp, CLEANER_RESPONSE.STARTED)) {
      return { status: 200, json: { ok: true, duplicate: true, status: st } };
    }
    const { error: uErr } = await admin
      .from("bookings")
      .update({ status: "in_progress", started_at: now, cleaner_response_status: CLEANER_RESPONSE.STARTED })
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

    const respComplete = String(bRow.cleaner_response_status ?? "").trim().toLowerCase();
    if (respComplete === CLEANER_RESPONSE.COMPLETED) {
      return { status: 200, json: { ok: true, duplicate: true, status: "completed" } };
    }
    /**
     * Job detail UI treats `bookings.status === in_progress` as the “complete” CTA; do not also require
     * `cleaner_response_status === started` — legacy / partial rows can be in_progress with a lagging response column.
     */
    const { error: uErr } = await admin
      .from("bookings")
      .update({ status: "completed", completed_at: now, cleaner_response_status: CLEANER_RESPONSE.COMPLETED })
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
