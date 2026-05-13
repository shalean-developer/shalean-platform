import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanerHasBookingAccess } from "@/lib/cleaner/cleanerBookingAccess";
import { ensureBookingAssignment } from "@/lib/dispatch/ensureBookingAssignment";
import { notifyBookingEvent } from "@/lib/notifications/notifyBookingEvent";
import { syncCleanerBusyFromBookings } from "@/lib/cleaner/syncCleanerStatus";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { BOOKING_PAYOUT_COLUMNS_CLEAR } from "@/lib/payout/bookingPayoutColumns";
import {
  fetchBookingDisplayEarningsCents,
  hasPersistedDisplayEarningsBasis,
  isCompletableDisplayEarningsCents,
} from "@/lib/payout/bookingEarningsIntegrity";
import { JOB_EARNING_UNAVAILABLE_ERROR_CODE } from "@/lib/cleaner/cleanerJobEarning";
import { persistCleanerPayoutIfUnset } from "@/lib/payout/persistCleanerPayout";
import { ensureCleanerEarningsLedgerRow } from "@/lib/payout/ensureCleanerEarningsLedger";
import { newPayoutMoneyPathErrorId } from "@/lib/payout/payoutMoneyPathErrorId";
import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";
import { CLEANER_LIFECYCLE_CODE } from "@/lib/cleaner/cleanerLifecycleErrors";
import {
  updateAssignableCleanerLifecycleBookingOrFail,
  updateCleanerLifecycleBookingState,
  updateRecurringPendingPaymentCleanerLifecycleBooking,
} from "@/lib/cleaner/cleanerLifecycleBookingCommands";
import { assignedOfferPastAcceptanceDeadline } from "@/lib/cleaner/cleanerAssignedOfferExpiry";
import { cleanerResponseAllowsProgression } from "@/lib/cleaner/cleanerResponseProgression";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { isCleanerAssignmentAccepted } from "@/lib/cleaner/cleanerMobileBookingMap";
import { isAssignableForCleanerLifecycleStatus } from "@/lib/cleaner/cleanerBookingLifecycleStatuses";
import {
  bookingIsRecurringPendingPayment,
  recurringPendingPaymentLifecycleAllowsAction,
  recurringPendingPaymentProgressionBlockedMessage,
} from "@/lib/cleaner/cleanerRecurringPendingPaymentLifecycle";
import { deriveBookingOperationalPhase } from "@/lib/booking/deriveBookingOperationalPhase";
import { buildCompletionCoherencePatch } from "@/lib/booking/bookingCompletionIntegrity";
import { isBookingCompletedRouterEnabled } from "@/lib/notifications/notificationRouter";

export type CleanerLifecycleAction = "accept" | "reject" | "en_route" | "start" | "complete";

export type CleanerLifecycleResult = { status: number; json: Record<string, unknown> };

function traceCleanerLifecycle(params: {
  outcome: "entered" | "blocked" | "success" | "duplicate";
  bookingId: string;
  cleanerId: string;
  action: CleanerLifecycleAction;
  bookingStatus: string;
  cleanerResponseStatus: string | null | undefined;
  dispatchStatus: string | null | undefined;
  httpStatus?: number;
  reasonCode?: string;
}): void {
  void logSystemEvent({
    level: params.outcome === "blocked" ? "warn" : "info",
    source: "cleaner_lifecycle_trace",
    message: params.reasonCode ?? `cleaner_lifecycle_${params.outcome}`,
    context: {
      outcome: params.outcome,
      booking_id: params.bookingId,
      cleaner_id: params.cleanerId,
      action: params.action,
      booking_status: params.bookingStatus,
      cleaner_response_status: params.cleanerResponseStatus ?? null,
      dispatch_status: params.dispatchStatus ?? null,
      http_status: params.httpStatus,
      reason_code: params.reasonCode,
    },
  });
}

function httpStatusForAcceptPatchFailure(code: string): number {
  if (code === CLEANER_LIFECYCLE_CODE.ACCEPT_UPDATE_NO_ROW || code === CLEANER_LIFECYCLE_CODE.BOOKING_STATE_CHANGED) {
    return 412;
  }
  return 500;
}

type BookingLifecycleRow = {
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
  started_at?: string | null;
  display_earnings_cents?: number | null;
  cleaner_earnings_total_cents?: number | null;
  billing_type?: string | null;
  is_recurring_generated?: boolean | null;
  monthly_invoice_id?: string | null;
};

async function handleRecurringPendingPaymentAccept(params: {
  admin: SupabaseClient;
  bookingId: string;
  cleanerId: string;
  bRow: BookingLifecycleRow;
  now: string;
}): Promise<CleanerLifecycleResult> {
  const { admin, bookingId, cleanerId, bRow, now } = params;
  const st = "pending_payment";
  if (
    assignedOfferPastAcceptanceDeadline({
      status: bRow.status ?? null,
      cleaner_response_status: bRow.cleaner_response_status ?? null,
      date: bRow.date ?? null,
      time: bRow.time ?? null,
      accepted_at: bRow.accepted_at ?? null,
      is_team_job: bRow.is_team_job === true,
    })
  ) {
    traceCleanerLifecycle({
      outcome: "blocked",
      bookingId,
      cleanerId,
      action: "accept",
      bookingStatus: st,
      cleanerResponseStatus: bRow.cleaner_response_status,
      dispatchStatus: bRow.dispatch_status,
      httpStatus: 400,
      reasonCode: CLEANER_LIFECYCLE_CODE.ACCEPT_OFFER_EXPIRED,
    });
    return {
      status: 400,
      json: {
        error: "This job is no longer available — the scheduled time has passed.",
        code: CLEANER_LIFECYCLE_CODE.ACCEPT_OFFER_EXPIRED,
      },
    };
  }

  let resp = String(bRow.cleaner_response_status ?? "")
    .trim()
    .toLowerCase();
  let acceptedAt = String(bRow.accepted_at ?? "").trim();
  const dispatchLower = String(bRow.dispatch_status ?? "").trim().toLowerCase();

  const orphanAcceptedAt =
    Boolean(acceptedAt) &&
    resp !== CLEANER_RESPONSE.ACCEPTED &&
    (resp === "" || resp === CLEANER_RESPONSE.NONE || resp === CLEANER_RESPONSE.PENDING);
  if (orphanAcceptedAt) {
    const { data: healRows, error: healErr } = await updateRecurringPendingPaymentCleanerLifecycleBooking({
      admin,
      bookingId,
      patch: { cleaner_response_status: CLEANER_RESPONSE.ACCEPTED },
    });
    if (!healErr && healRows?.length) {
      bRow.cleaner_response_status = CLEANER_RESPONSE.ACCEPTED;
      resp = CLEANER_RESPONSE.ACCEPTED;
    }
  }

  if (resp === CLEANER_RESPONSE.ACCEPTED) {
    const patch: Record<string, unknown> = {};
    if (!acceptedAt) patch.accepted_at = now;
    if (Object.keys(patch).length > 0) {
      const { data: patchRows, error: pErr } = await updateRecurringPendingPaymentCleanerLifecycleBooking({
        admin,
        bookingId,
        patch,
      });
      if (pErr || !patchRows?.length) {
        traceCleanerLifecycle({
          outcome: "blocked",
          bookingId,
          cleanerId,
          action: "accept",
          bookingStatus: st,
          cleanerResponseStatus: bRow.cleaner_response_status,
          dispatchStatus: bRow.dispatch_status,
          httpStatus: 412,
          reasonCode: CLEANER_LIFECYCLE_CODE.BOOKING_STATE_CHANGED,
        });
        return {
          status: 412,
          json: {
            error:
              "Could not save — this visit is no longer awaiting payment in the same way. Refresh the page and try again.",
            code: CLEANER_LIFECYCLE_CODE.BOOKING_STATE_CHANGED,
          },
        };
      }
    }
    await syncCleanerBusyFromBookings(admin, cleanerId);
    traceCleanerLifecycle({
      outcome: "success",
      bookingId,
      cleanerId,
      action: "accept",
      bookingStatus: st,
      cleanerResponseStatus: CLEANER_RESPONSE.ACCEPTED,
      dispatchStatus: bRow.dispatch_status,
      httpStatus: 200,
    });
    return {
      status: 200,
      json: { ok: true, status: "pending_payment", cleaner_response_status: CLEANER_RESPONSE.ACCEPTED },
    };
  }

  if (resp === CLEANER_RESPONSE.ON_MY_WAY || resp === CLEANER_RESPONSE.STARTED) {
    traceCleanerLifecycle({
      outcome: "blocked",
      bookingId,
      cleanerId,
      action: "accept",
      bookingStatus: st,
      cleanerResponseStatus: bRow.cleaner_response_status,
      dispatchStatus: bRow.dispatch_status,
      httpStatus: 400,
      reasonCode: CLEANER_LIFECYCLE_CODE.RECURRING_PENDING_PAYMENT_PROGRESSION_BLOCKED,
    });
    return {
      status: 400,
      json: {
        error: recurringPendingPaymentProgressionBlockedMessage(),
        code: CLEANER_LIFECYCLE_CODE.RECURRING_PENDING_PAYMENT_PROGRESSION_BLOCKED,
      },
    };
  }

  if (!cleanerResponseAllowsProgression(resp, CLEANER_RESPONSE.ACCEPTED, { allowEqual: true })) {
    await syncCleanerBusyFromBookings(admin, cleanerId);
    traceCleanerLifecycle({
      outcome: "duplicate",
      bookingId,
      cleanerId,
      action: "accept",
      bookingStatus: st,
      cleanerResponseStatus: String(bRow.cleaner_response_status ?? resp),
      dispatchStatus: bRow.dispatch_status,
      httpStatus: 200,
      reasonCode: "accept_duplicate_state",
    });
    return {
      status: 200,
      json: {
        ok: true,
        duplicate: true,
        status: "pending_payment",
        cleaner_response_status: String(bRow.cleaner_response_status ?? resp),
      },
    };
  }

  const { data: accRows, error: accErr } = await updateRecurringPendingPaymentCleanerLifecycleBooking({
    admin,
    bookingId,
    patch: {
      cleaner_response_status: CLEANER_RESPONSE.ACCEPTED,
      accepted_at: now,
    },
  });

  if (accErr || !accRows?.length) {
    if (!accErr) {
      void reportOperationalIssue("warn", "cleaner/jobs/accept", "recurring_pending_accept_zero_rows", {
        bookingId,
        cleanerId,
      });
    }
    traceCleanerLifecycle({
      outcome: "blocked",
      bookingId,
      cleanerId,
      action: "accept",
      bookingStatus: st,
      cleanerResponseStatus: bRow.cleaner_response_status,
      dispatchStatus: bRow.dispatch_status,
      httpStatus: accErr ? 500 : 412,
      reasonCode: accErr ? "recurring_pending_accept_failed" : CLEANER_LIFECYCLE_CODE.ACCEPT_UPDATE_NO_ROW,
    });
    return {
      status: accErr ? 500 : 412,
      json: {
        error: accErr?.message ?? "Could not save acceptance — refresh and try again.",
        code: accErr ? "recurring_pending_accept_failed" : CLEANER_LIFECYCLE_CODE.ACCEPT_UPDATE_NO_ROW,
      },
    };
  }

  await syncCleanerBusyFromBookings(admin, cleanerId);
  traceCleanerLifecycle({
    outcome: "success",
    bookingId,
    cleanerId,
    action: "accept",
    bookingStatus: st,
    cleanerResponseStatus: CLEANER_RESPONSE.ACCEPTED,
    dispatchStatus: dispatchLower || null,
    httpStatus: 200,
  });
  return {
    status: 200,
    json: { ok: true, status: "pending_payment", cleaner_response_status: CLEANER_RESPONSE.ACCEPTED },
  };
}

async function handleRecurringPendingPaymentReject(params: {
  admin: SupabaseClient;
  bookingId: string;
  cleanerId: string;
  bRow: BookingLifecycleRow;
}): Promise<CleanerLifecycleResult> {
  const { admin, bookingId, cleanerId, bRow } = params;
  const attempts = Number(bRow.assignment_attempts ?? 0);
  const { data: rejRows, error: uErr } = await updateRecurringPendingPaymentCleanerLifecycleBooking({
    admin,
    bookingId,
    patch: {
      cleaner_id: null,
      payout_owner_cleaner_id: null,
      assigned_at: null,
      accepted_at: null,
      en_route_at: null,
      started_at: null,
      assignment_attempts: attempts + 1,
      cleaner_response_status: CLEANER_RESPONSE.NONE,
      status: "pending_payment",
      ...BOOKING_PAYOUT_COLUMNS_CLEAR,
    },
  });

  if (uErr || !rejRows?.length) {
    traceCleanerLifecycle({
      outcome: "blocked",
      bookingId,
      cleanerId,
      action: "reject",
      bookingStatus: "pending_payment",
      cleanerResponseStatus: bRow.cleaner_response_status,
      dispatchStatus: bRow.dispatch_status,
      httpStatus: uErr ? 500 : 412,
      reasonCode: uErr ? "reject_recurring_pending_failed" : CLEANER_LIFECYCLE_CODE.BOOKING_STATE_CHANGED,
    });
    return {
      status: uErr ? 500 : 412,
      json: {
        error: uErr?.message ?? "Could not decline — this visit may have already updated. Refresh and try again.",
        code: uErr ? "reject_recurring_pending_failed" : CLEANER_LIFECYCLE_CODE.BOOKING_STATE_CHANGED,
      },
    };
  }

  await syncCleanerBusyFromBookings(admin, cleanerId);

  const auto = process.env.AUTO_DISPATCH_CLEANERS !== "false";
  if (auto) {
    const r = await ensureBookingAssignment(admin, bookingId, {
      source: "cleaner_job_reject_recurring_pending",
      smartAssign: { excludeCleanerIds: [cleanerId] },
    });
    if (!r.ok) {
      await reportOperationalIssue("warn", "cleaner/reject", "Re-dispatch failed (recurring pending)", {
        bookingId,
        reason: r.error,
      });
    }
  }

  traceCleanerLifecycle({
    outcome: "success",
    bookingId,
    cleanerId,
    action: "reject",
    bookingStatus: "pending_payment",
    cleanerResponseStatus: CLEANER_RESPONSE.NONE,
    dispatchStatus: bRow.dispatch_status,
    httpStatus: 200,
  });
  return { status: 200, json: { ok: true, status: "pending_payment", reassigned: auto } };
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
      "id, cleaner_id, payout_owner_cleaner_id, team_id, is_team_job, status, date, time, assignment_attempts, cleaner_response_status, accepted_at, dispatch_status, en_route_at, started_at, display_earnings_cents, cleaner_earnings_total_cents, is_recurring_generated, billing_type, monthly_invoice_id",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (bErr || !booking) {
    traceCleanerLifecycle({
      outcome: "blocked",
      bookingId,
      cleanerId,
      action,
      bookingStatus: "",
      cleanerResponseStatus: null,
      dispatchStatus: null,
      httpStatus: 404,
      reasonCode: "booking_not_found",
    });
    return { status: 404, json: { error: "Booking not found." } };
  }

  const bRow = booking as BookingLifecycleRow;
  const canAccess = await cleanerHasBookingAccess(admin, cleanerId, {
    id: bRow.id ?? bookingId,
    cleaner_id: bRow.cleaner_id ?? null,
    payout_owner_cleaner_id: bRow.payout_owner_cleaner_id ?? null,
    team_id: bRow.team_id ?? null,
    is_team_job: bRow.is_team_job === true,
  });
  if (!canAccess) {
    traceCleanerLifecycle({
      outcome: "blocked",
      bookingId,
      cleanerId,
      action,
      bookingStatus: String(bRow.status ?? "").toLowerCase(),
      cleanerResponseStatus: bRow.cleaner_response_status,
      dispatchStatus: bRow.dispatch_status,
      httpStatus: 403,
      reasonCode: "cleaner_forbidden",
    });
    return { status: 403, json: { error: "Not your job." } };
  }

  const isTeamJob = bRow.is_team_job === true;

  if (isTeamJob && action === "reject") {
    traceCleanerLifecycle({
      outcome: "blocked",
      bookingId,
      cleanerId,
      action,
      bookingStatus: String(bRow.status ?? "").toLowerCase(),
      cleanerResponseStatus: bRow.cleaner_response_status,
      dispatchStatus: bRow.dispatch_status,
      httpStatus: 400,
      reasonCode: CLEANER_LIFECYCLE_CODE.TEAM_REJECT_FORBIDDEN,
    });
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
  const rowRec = bRow as Record<string, unknown>;
  const isRecurringPendingPayment = bookingIsRecurringPendingPayment(rowRec);

  if (st === "pending_payment") {
    const gate = recurringPendingPaymentLifecycleAllowsAction(action, rowRec);
    if (!gate.allowed) {
      if (gate.reason === "recurring_pending_payment_progression") {
        void logSystemEvent({
          level: "warn",
          source: "cleaner_lifecycle_recurring_pending",
          message: "lifecycle_action_blocked",
          context: {
            lifecycle_block_reason: "recurring_pending_payment",
            action,
            booking_id: bookingId,
            cleaner_id: cleanerId,
            booking_status: st,
            billing_type: bRow.billing_type ?? null,
          },
        });
        traceCleanerLifecycle({
          outcome: "blocked",
          bookingId,
          cleanerId,
          action,
          bookingStatus: st,
          cleanerResponseStatus: bRow.cleaner_response_status,
          dispatchStatus: bRow.dispatch_status,
          httpStatus: 400,
          reasonCode: CLEANER_LIFECYCLE_CODE.RECURRING_PENDING_PAYMENT_PROGRESSION_BLOCKED,
        });
        return {
          status: 400,
          json: {
            error: recurringPendingPaymentProgressionBlockedMessage(),
            code: CLEANER_LIFECYCLE_CODE.RECURRING_PENDING_PAYMENT_PROGRESSION_BLOCKED,
          },
        };
      }
      traceCleanerLifecycle({
        outcome: "blocked",
        bookingId,
        cleanerId,
        action,
        bookingStatus: st,
        cleanerResponseStatus: bRow.cleaner_response_status,
        dispatchStatus: bRow.dispatch_status,
        httpStatus: 400,
        reasonCode: CLEANER_LIFECYCLE_CODE.PENDING_PAYMENT_LIFECYCLE_BLOCKED,
      });
      return {
        status: 400,
        json: {
          error: "This booking is still awaiting payment. Actions unlock after payment is confirmed.",
          code: CLEANER_LIFECYCLE_CODE.PENDING_PAYMENT_LIFECYCLE_BLOCKED,
        },
      };
    }
  }

  traceCleanerLifecycle({
    outcome: "entered",
    bookingId,
    cleanerId,
    action,
    bookingStatus: st,
    cleanerResponseStatus: bRow.cleaner_response_status,
    dispatchStatus: bRow.dispatch_status,
  });

  if (action === "accept") {
    if (isRecurringPendingPayment) {
      return handleRecurringPendingPaymentAccept({ admin, bookingId, cleanerId, bRow, now });
    }
    if (!isAssignableForCleanerLifecycleStatus(bRow.status)) {
      traceCleanerLifecycle({
        outcome: "blocked",
        bookingId,
        cleanerId,
        action,
        bookingStatus: st,
        cleanerResponseStatus: bRow.cleaner_response_status,
        dispatchStatus: bRow.dispatch_status,
        httpStatus: 400,
        reasonCode: CLEANER_LIFECYCLE_CODE.NOT_ASSIGNED,
      });
      return {
        status: 400,
        json: {
          error: "Job is not in an assignable state (offered, assigned, or confirmed). Refresh if this looks wrong.",
          code: CLEANER_LIFECYCLE_CODE.NOT_ASSIGNED,
        },
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
      if (st === "confirmed" || st === "offered") heal.status = "assigned";
      const healRes = await updateAssignableCleanerLifecycleBookingOrFail({ admin, bookingId, patch: heal });
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
      if (st === "confirmed" || st === "offered") patch.status = "assigned";
      if (Object.keys(patch).length > 0) {
        const patchRes = await updateAssignableCleanerLifecycleBookingOrFail({ admin, bookingId, patch });
        if (!patchRes.ok) {
          const stHttp = httpStatusForAcceptPatchFailure(patchRes.code);
          if (
            patchRes.code === CLEANER_LIFECYCLE_CODE.ACCEPT_UPDATE_NO_ROW ||
            patchRes.code === CLEANER_LIFECYCLE_CODE.BOOKING_STATE_CHANGED
          ) {
            void reportOperationalIssue("warn", "cleaner/jobs/accept", "accept_patch_zero_rows", {
              bookingId,
              cleanerId,
            });
          }
          traceCleanerLifecycle({
            outcome: "blocked",
            bookingId,
            cleanerId,
            action,
            bookingStatus: st,
            cleanerResponseStatus: bRow.cleaner_response_status,
            dispatchStatus: bRow.dispatch_status,
            httpStatus: stHttp,
            reasonCode: patchRes.code,
          });
          return { status: stHttp, json: { error: patchRes.message, code: patchRes.code } };
        }
      }
      await syncCleanerBusyFromBookings(admin, cleanerId);
      traceCleanerLifecycle({
        outcome: "success",
        bookingId,
        cleanerId,
        action,
        bookingStatus: st,
        cleanerResponseStatus: CLEANER_RESPONSE.ACCEPTED,
        dispatchStatus: bRow.dispatch_status,
        httpStatus: 200,
      });
      return { status: 200, json: { ok: true, status: "assigned", cleaner_response_status: CLEANER_RESPONSE.ACCEPTED } };
    }
    if (
      assignedOfferPastAcceptanceDeadline({
        status: bRow.status ?? null,
        cleaner_response_status: bRow.cleaner_response_status ?? null,
        date: bRow.date ?? null,
        time: bRow.time ?? null,
        accepted_at: bRow.accepted_at ?? null,
        is_team_job: bRow.is_team_job === true,
      })
    ) {
      traceCleanerLifecycle({
        outcome: "blocked",
        bookingId,
        cleanerId,
        action,
        bookingStatus: st,
        cleanerResponseStatus: bRow.cleaner_response_status,
        dispatchStatus: bRow.dispatch_status,
        httpStatus: 400,
        reasonCode: CLEANER_LIFECYCLE_CODE.ACCEPT_OFFER_EXPIRED,
      });
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
      traceCleanerLifecycle({
        outcome: "success",
        bookingId,
        cleanerId,
        action,
        bookingStatus: st,
        cleanerResponseStatus: String(bRow.cleaner_response_status ?? resp),
        dispatchStatus: bRow.dispatch_status,
        httpStatus: 200,
      });
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
      traceCleanerLifecycle({
        outcome: "duplicate",
        bookingId,
        cleanerId,
        action,
        bookingStatus: st,
        cleanerResponseStatus: String(bRow.cleaner_response_status ?? resp),
        dispatchStatus: bRow.dispatch_status,
        httpStatus: 200,
        reasonCode: "accept_duplicate_state",
      });
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
    if (st === "confirmed" || st === "offered") {
      acceptPayload.status = "assigned";
    }
    if (dispatchLower === "offered") {
      acceptPayload.dispatch_status = "assigned";
    }
    const accRes = await updateAssignableCleanerLifecycleBookingOrFail({ admin, bookingId, patch: acceptPayload });
    if (!accRes.ok) {
      const stHttp = httpStatusForAcceptPatchFailure(accRes.code);
      if (
        accRes.code === CLEANER_LIFECYCLE_CODE.ACCEPT_UPDATE_NO_ROW ||
        accRes.code === CLEANER_LIFECYCLE_CODE.BOOKING_STATE_CHANGED
      ) {
        void reportOperationalIssue("warn", "cleaner/jobs/accept", "accept_primary_zero_rows", {
          bookingId,
          cleanerId,
          cleaner_response_status: resp,
        });
      }
      traceCleanerLifecycle({
        outcome: "blocked",
        bookingId,
        cleanerId,
        action,
        bookingStatus: st,
        cleanerResponseStatus: bRow.cleaner_response_status,
        dispatchStatus: bRow.dispatch_status,
        httpStatus: stHttp,
        reasonCode: accRes.code,
      });
      return { status: stHttp, json: { error: accRes.message, code: accRes.code } };
    }
    await syncCleanerBusyFromBookings(admin, cleanerId);
    traceCleanerLifecycle({
      outcome: "success",
      bookingId,
      cleanerId,
      action,
      bookingStatus: "assigned",
      cleanerResponseStatus: CLEANER_RESPONSE.ACCEPTED,
      dispatchStatus: bRow.dispatch_status,
      httpStatus: 200,
    });
    return { status: 200, json: { ok: true, status: "assigned", cleaner_response_status: CLEANER_RESPONSE.ACCEPTED } };
  }

  if (action === "reject") {
    if (isRecurringPendingPayment) {
      return handleRecurringPendingPaymentReject({ admin, bookingId, cleanerId, bRow });
    }
    if (!isAssignableForCleanerLifecycleStatus(bRow.status)) {
      traceCleanerLifecycle({
        outcome: "blocked",
        bookingId,
        cleanerId,
        action,
        bookingStatus: st,
        cleanerResponseStatus: bRow.cleaner_response_status,
        dispatchStatus: bRow.dispatch_status,
        httpStatus: 400,
        reasonCode: CLEANER_LIFECYCLE_CODE.NOT_ASSIGNED_FOR_REJECT,
      });
      return {
        status: 400,
        json: { error: "You can only reject before starting the job.", code: CLEANER_LIFECYCLE_CODE.NOT_ASSIGNED_FOR_REJECT },
      };
    }
    const attempts = Number(bRow.assignment_attempts ?? 0);
    const { error: uErr } = await updateCleanerLifecycleBookingState({
      admin,
      bookingId,
      patch: {
        cleaner_id: null,
        status: "pending",
        assigned_at: null,
        accepted_at: null,
        en_route_at: null,
        started_at: null,
        assignment_attempts: attempts + 1,
        cleaner_response_status: CLEANER_RESPONSE.NONE,
        ...BOOKING_PAYOUT_COLUMNS_CLEAR,
      },
    });

    if (uErr) {
      traceCleanerLifecycle({
        outcome: "blocked",
        bookingId,
        cleanerId,
        action,
        bookingStatus: st,
        cleanerResponseStatus: bRow.cleaner_response_status,
        dispatchStatus: bRow.dispatch_status,
        httpStatus: 500,
        reasonCode: "reject_update_failed",
      });
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

    traceCleanerLifecycle({
      outcome: "success",
      bookingId,
      cleanerId,
      action,
      bookingStatus: "pending",
      cleanerResponseStatus: CLEANER_RESPONSE.NONE,
      dispatchStatus: bRow.dispatch_status,
      httpStatus: 200,
    });
    return { status: 200, json: { ok: true, status: "pending", reassigned: auto } };
  }

  if (action === "en_route") {
    if (!isAssignableForCleanerLifecycleStatus(bRow.status)) {
      traceCleanerLifecycle({
        outcome: "blocked",
        bookingId,
        cleanerId,
        action,
        bookingStatus: st,
        cleanerResponseStatus: bRow.cleaner_response_status,
        dispatchStatus: bRow.dispatch_status,
        httpStatus: 400,
        reasonCode: CLEANER_LIFECYCLE_CODE.INVALID_EN_ROUTE_STATE,
      });
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
      traceCleanerLifecycle({
        outcome: "blocked",
        bookingId,
        cleanerId,
        action,
        bookingStatus: st,
        cleanerResponseStatus: bRow.cleaner_response_status,
        dispatchStatus: bRow.dispatch_status,
        httpStatus: 400,
        reasonCode: CLEANER_LIFECYCLE_CODE.ACCEPT_REQUIRED_BEFORE_TRAVEL,
      });
      return {
        status: 400,
        json: { error: "Accept the job before heading out.", code: CLEANER_LIFECYCLE_CODE.ACCEPT_REQUIRED_BEFORE_TRAVEL },
      };
    }
    if (!cleanerResponseAllowsProgression(String(bRow.cleaner_response_status ?? ""), CLEANER_RESPONSE.ON_MY_WAY)) {
      traceCleanerLifecycle({
        outcome: "duplicate",
        bookingId,
        cleanerId,
        action,
        bookingStatus: st,
        cleanerResponseStatus: bRow.cleaner_response_status,
        dispatchStatus: bRow.dispatch_status,
        httpStatus: 200,
        reasonCode: "en_route_duplicate",
      });
      return { status: 200, json: { ok: true, duplicate: true, status: st } };
    }
    const enRoutePatch: Record<string, unknown> = {
      en_route_at: now,
      cleaner_response_status: CLEANER_RESPONSE.ON_MY_WAY,
    };
    if (st === "confirmed" || st === "offered") enRoutePatch.status = "assigned";
    const { error: uErr } = await updateCleanerLifecycleBookingState({ admin, bookingId, patch: enRoutePatch });
    if (uErr) {
      traceCleanerLifecycle({
        outcome: "blocked",
        bookingId,
        cleanerId,
        action,
        bookingStatus: st,
        cleanerResponseStatus: bRow.cleaner_response_status,
        dispatchStatus: bRow.dispatch_status,
        httpStatus: 500,
        reasonCode: "en_route_update_failed",
      });
      return { status: 500, json: { error: uErr.message } };
    }
    const normalizedSt = st === "confirmed" || st === "offered" ? "assigned" : st;
    traceCleanerLifecycle({
      outcome: "success",
      bookingId,
      cleanerId,
      action,
      bookingStatus: normalizedSt,
      cleanerResponseStatus: CLEANER_RESPONSE.ON_MY_WAY,
      dispatchStatus: bRow.dispatch_status,
      httpStatus: 200,
    });
    return { status: 200, json: { ok: true, status: normalizedSt } };
  }

  if (action === "start") {
    const startableBooking = isAssignableForCleanerLifecycleStatus(bRow.status) || st === "in_progress";
    if (!startableBooking) {
      traceCleanerLifecycle({
        outcome: "blocked",
        bookingId,
        cleanerId,
        action,
        bookingStatus: st,
        cleanerResponseStatus: bRow.cleaner_response_status,
        dispatchStatus: bRow.dispatch_status,
        httpStatus: 400,
        reasonCode: CLEANER_LIFECYCLE_CODE.START_REQUIRES_ASSIGNED,
      });
      return {
        status: 400,
        json: {
          error: "Start requires an active assignment or an in-progress job that needs syncing.",
          code: CLEANER_LIFECYCLE_CODE.START_REQUIRES_ASSIGNED,
        },
      };
    }
    const startResp = String(bRow.cleaner_response_status ?? "")
      .trim()
      .toLowerCase();
    const travelAcked = Boolean(bRow.en_route_at) || startResp === CLEANER_RESPONSE.ON_MY_WAY;
    const acceptedForStart = isCleanerAssignmentAccepted({
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
    if (!travelAcked) {
      if (!acceptedForStart) {
        traceCleanerLifecycle({
          outcome: "blocked",
          bookingId,
          cleanerId,
          action,
          bookingStatus: st,
          cleanerResponseStatus: bRow.cleaner_response_status,
          dispatchStatus: bRow.dispatch_status,
          httpStatus: 400,
          reasonCode: CLEANER_LIFECYCLE_CODE.EN_ROUTE_REQUIRED_BEFORE_START,
        });
        return {
          status: 400,
          json: {
            error: "Mark on the way before starting the job.",
            code: CLEANER_LIFECYCLE_CODE.EN_ROUTE_REQUIRED_BEFORE_START,
          },
        };
      }
    }
    if (!cleanerResponseAllowsProgression(startResp, CLEANER_RESPONSE.STARTED)) {
      /**
       * Idempotent retries: `cleaner_response_status` can already be `started` while `status` stayed
       * `assigned`/`offered`/`confirmed` (partial writes / legacy drift). Promote operational status in one update.
       */
      if (startResp === CLEANER_RESPONSE.STARTED && st !== "in_progress") {
        const healPatch: Record<string, unknown> = {
          status: "in_progress",
          cleaner_response_status: CLEANER_RESPONSE.STARTED,
          started_at: String(bRow.started_at ?? "").trim() || now,
        };
        if (!String(bRow.en_route_at ?? "").trim()) {
          healPatch.en_route_at = now;
        }
        const { error: healErr } = await updateCleanerLifecycleBookingState({ admin, bookingId, patch: healPatch });
        if (healErr) {
          traceCleanerLifecycle({
            outcome: "blocked",
            bookingId,
            cleanerId,
            action,
            bookingStatus: st,
            cleanerResponseStatus: bRow.cleaner_response_status,
            dispatchStatus: bRow.dispatch_status,
            httpStatus: 500,
            reasonCode: "start_operational_heal_failed",
          });
          return { status: 500, json: { error: healErr.message } };
        }
        void logSystemEvent({
          level: "info",
          source: "cleaner/jobs/start",
          message: "healed_booking_status_in_progress",
          context: {
            booking_id: bookingId,
            cleaner_id: cleanerId,
            prior_status: st,
            operational_phase: deriveBookingOperationalPhase({
              status: "in_progress",
              cleaner_response_status: CLEANER_RESPONSE.STARTED,
              en_route_at: (healPatch.en_route_at as string) ?? bRow.en_route_at,
              started_at: (healPatch.started_at as string) ?? bRow.started_at,
              completed_at: null,
              dispatch_status: bRow.dispatch_status,
            }),
          },
        });
        await syncCleanerBusyFromBookings(admin, cleanerId);
        traceCleanerLifecycle({
          outcome: "success",
          bookingId,
          cleanerId,
          action,
          bookingStatus: "in_progress",
          cleanerResponseStatus: CLEANER_RESPONSE.STARTED,
          dispatchStatus: bRow.dispatch_status,
          httpStatus: 200,
          reasonCode: "start_operational_heal",
        });
        return { status: 200, json: { ok: true, status: "in_progress", healed: true } };
      }
      traceCleanerLifecycle({
        outcome: "duplicate",
        bookingId,
        cleanerId,
        action,
        bookingStatus: st,
        cleanerResponseStatus: bRow.cleaner_response_status,
        dispatchStatus: bRow.dispatch_status,
        httpStatus: 200,
        reasonCode: "start_duplicate",
      });
      return { status: 200, json: { ok: true, duplicate: true, status: st } };
    }
    const implicitEnRoute = !travelAcked && acceptedForStart;
    const startPatch: Record<string, unknown> = {
      status: "in_progress",
      started_at: String(bRow.started_at ?? "").trim() || now,
      cleaner_response_status: CLEANER_RESPONSE.STARTED,
    };
    if (implicitEnRoute) {
      startPatch.en_route_at = String(bRow.en_route_at ?? "").trim() || now;
    }
    const { error: uErr } = await updateCleanerLifecycleBookingState({ admin, bookingId, patch: startPatch });
    if (uErr) {
      traceCleanerLifecycle({
        outcome: "blocked",
        bookingId,
        cleanerId,
        action,
        bookingStatus: st,
        cleanerResponseStatus: bRow.cleaner_response_status,
        dispatchStatus: bRow.dispatch_status,
        httpStatus: 500,
        reasonCode: "start_update_failed",
      });
      return { status: 500, json: { error: uErr.message } };
    }
    await syncCleanerBusyFromBookings(admin, cleanerId);
    traceCleanerLifecycle({
      outcome: "success",
      bookingId,
      cleanerId,
      action,
      bookingStatus: "in_progress",
      cleanerResponseStatus: CLEANER_RESPONSE.STARTED,
      dispatchStatus: bRow.dispatch_status,
      httpStatus: 200,
    });
    return { status: 200, json: { ok: true, status: "in_progress" } };
  }

  if (action === "complete") {
    if (st !== "in_progress") {
      traceCleanerLifecycle({
        outcome: "blocked",
        bookingId,
        cleanerId,
        action,
        bookingStatus: st,
        cleanerResponseStatus: bRow.cleaner_response_status,
        dispatchStatus: bRow.dispatch_status,
        httpStatus: 400,
        reasonCode: CLEANER_LIFECYCLE_CODE.COMPLETE_REQUIRES_IN_PROGRESS,
      });
      return {
        status: 400,
        json: {
          error: "Mark the job as started before completing.",
          code: CLEANER_LIFECYCLE_CODE.COMPLETE_REQUIRES_IN_PROGRESS,
        },
      };
    }

    void logSystemEvent({
      level: "info",
      source: "cleaner_lifecycle_complete",
      message: "complete_attempt",
      context: {
        booking_id: bookingId,
        cleaner_id: cleanerId,
        status: st,
        cleaner_response_status: bRow.cleaner_response_status ?? null,
        display_earnings_cents: bRow.display_earnings_cents ?? null,
        cleaner_earnings_total_cents: bRow.cleaner_earnings_total_cents ?? null,
      },
    });

    try {
      const payout = await persistCleanerPayoutIfUnset({ admin, bookingId, cleanerId });
      if (payout.ok === false) {
        const error_id = newPayoutMoneyPathErrorId();
        const persistCode = payout.code ?? "payout_persist_failed";
        await reportOperationalIssue("error", "cleaner/jobs/complete", `payout before completion: ${payout.error}`, {
          bookingId,
          cleanerId,
          error_id,
          code: persistCode,
        });
        void logSystemEvent({
          level: "warn",
          source: "cleaner_lifecycle_complete",
          message: "complete_failed_payout",
          context: {
            booking_id: bookingId,
            cleaner_id: cleanerId,
            reason: persistCode,
            detail: payout.error ?? null,
            display_earnings_cents: bRow.display_earnings_cents ?? null,
            cleaner_earnings_total_cents: bRow.cleaner_earnings_total_cents ?? null,
            error_id,
          },
        });
        traceCleanerLifecycle({
          outcome: "blocked",
          bookingId,
          cleanerId,
          action,
          bookingStatus: st,
          cleanerResponseStatus: bRow.cleaner_response_status,
          dispatchStatus: bRow.dispatch_status,
          httpStatus: 500,
          reasonCode: persistCode,
        });
        return {
          status: 500,
          json: {
            error: payout.error ?? "Could not record earnings for this job.",
            code: persistCode,
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
        void logSystemEvent({
          level: "warn",
          source: "cleaner_lifecycle_complete",
          message: "complete_failed_payout",
          context: {
            booking_id: bookingId,
            cleaner_id: cleanerId,
            reason: "payout_verify_failed",
            display_earnings_cents_after_fetch: displayCents,
            display_earnings_cents_on_row: bRow.display_earnings_cents ?? null,
            cleaner_earnings_total_cents: bRow.cleaner_earnings_total_cents ?? null,
            error_id,
          },
        });
        traceCleanerLifecycle({
          outcome: "blocked",
          bookingId,
          cleanerId,
          action,
          bookingStatus: st,
          cleanerResponseStatus: bRow.cleaner_response_status,
          dispatchStatus: bRow.dispatch_status,
          httpStatus: 500,
          reasonCode: "payout_verify_failed",
        });
        return {
          status: 500,
          json: {
            error: "Cleaner earnings could not be verified for this job. Try again later or contact support.",
            code: "payout_verify_failed",
            error_id,
          },
        };
      }
      /**
       * Strict positive gate: even when persist succeeded and verify says
       * `display_earnings_cents` is non-null, R0 means the booking has no
       * payment basis (e.g. unpaid recurring/monthly invoice, backfill line
       * items priced at R0). Allowing completion here records a no-payout
       * job — block with a clear admin/data-integrity error so support can
       * recompute earnings (`/api/admin/bookings/[id]/reset-earnings?force=true`
       * or the `repairZeroEarningAssignedBookings` script) before the
       * cleaner re-tries.
       */
      if (!isCompletableDisplayEarningsCents(displayCents)) {
        const error_id = newPayoutMoneyPathErrorId();
        await reportOperationalIssue(
          "error",
          "cleaner/jobs/complete",
          "display_earnings_cents resolved to zero — completion blocked",
          {
            bookingId,
            cleanerId,
            error_id,
            code: JOB_EARNING_UNAVAILABLE_ERROR_CODE,
            display_earnings_cents: displayCents,
          },
        );
        void logSystemEvent({
          level: "warn",
          source: "cleaner_lifecycle_complete",
          message: "complete_blocked_zero_earning",
          context: {
            booking_id: bookingId,
            cleaner_id: cleanerId,
            reason: JOB_EARNING_UNAVAILABLE_ERROR_CODE,
            display_earnings_cents: displayCents,
            cleaner_earnings_total_cents: bRow.cleaner_earnings_total_cents ?? null,
            error_id,
          },
        });
        traceCleanerLifecycle({
          outcome: "blocked",
          bookingId,
          cleanerId,
          action,
          bookingStatus: st,
          cleanerResponseStatus: bRow.cleaner_response_status,
          dispatchStatus: bRow.dispatch_status,
          httpStatus: 422,
          reasonCode: JOB_EARNING_UNAVAILABLE_ERROR_CODE,
        });
        return {
          status: 422,
          json: {
            error:
              "Job earning is R0,00 — please contact support to confirm the cleaner amount before completing this job.",
            code: JOB_EARNING_UNAVAILABLE_ERROR_CODE,
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
      void logSystemEvent({
        level: "warn",
        source: "cleaner_lifecycle_complete",
        message: "complete_failed_payout",
        context: {
          booking_id: bookingId,
          cleaner_id: cleanerId,
          reason: "payout_persist_threw",
          detail: msg,
          display_earnings_cents: bRow.display_earnings_cents ?? null,
          cleaner_earnings_total_cents: bRow.cleaner_earnings_total_cents ?? null,
          error_id,
        },
      });
      traceCleanerLifecycle({
        outcome: "blocked",
        bookingId,
        cleanerId,
        action,
        bookingStatus: st,
        cleanerResponseStatus: bRow.cleaner_response_status,
        dispatchStatus: bRow.dispatch_status,
        httpStatus: 500,
        reasonCode: "payout_persist_failed",
      });
      return {
        status: 500,
        json: { error: "Could not record earnings for this job.", code: "payout_persist_failed", error_id },
      };
    }

    const respComplete = String(bRow.cleaner_response_status ?? "").trim().toLowerCase();
    if (respComplete === CLEANER_RESPONSE.COMPLETED) {
      traceCleanerLifecycle({
        outcome: "duplicate",
        bookingId,
        cleanerId,
        action,
        bookingStatus: st,
        cleanerResponseStatus: bRow.cleaner_response_status,
        dispatchStatus: bRow.dispatch_status,
        httpStatus: 200,
        reasonCode: "complete_duplicate",
      });
      return { status: 200, json: { ok: true, duplicate: true, status: "completed" } };
    }
    /**
     * Job detail UI treats `bookings.status === in_progress` as the “complete” CTA; do not also require
     * `cleaner_response_status === started` — legacy / partial rows can be in_progress with a lagging response column.
     */
    const { patch: completionCoherencePatch } = buildCompletionCoherencePatch({
      beforeDispatchStatus: bRow.dispatch_status ?? null,
      fillCompletedAtIfMissing: false,
      nowIso: now,
    });
    const { error: uErr } = await updateCleanerLifecycleBookingState({
      admin,
      bookingId,
      patch: {
        status: "completed",
        completed_at: now,
        cleaner_response_status: CLEANER_RESPONSE.COMPLETED,
        ...completionCoherencePatch,
      },
    });
    if (!uErr) {
      const led = await ensureCleanerEarningsLedgerRow({ admin, bookingId });
      if (!led.ok) {
        void reportOperationalIssue("warn", "cleaner/jobs/complete", `ensureCleanerEarningsLedgerRow: ${led.error}`, {
          bookingId,
          cleanerId,
        });
      }
    }

    if (uErr) {
      void logSystemEvent({
        level: "warn",
        source: "cleaner_lifecycle_complete",
        message: "complete_failed_booking_update",
        context: {
          booking_id: bookingId,
          cleaner_id: cleanerId,
          pg_message: uErr.message,
          pg_code: (uErr as { code?: string }).code ?? null,
        },
      });
      traceCleanerLifecycle({
        outcome: "blocked",
        bookingId,
        cleanerId,
        action,
        bookingStatus: st,
        cleanerResponseStatus: bRow.cleaner_response_status,
        dispatchStatus: bRow.dispatch_status,
        httpStatus: 500,
        reasonCode: "complete_update_failed",
      });
      return {
        status: 500,
        json: {
          error: uErr.message || "Could not mark this job complete.",
          code: "complete_update_failed",
        },
      };
    }

    void logSystemEvent({
      level: "info",
      source: "cleaner_lifecycle_complete",
      message: "complete_success",
      context: {
        booking_id: bookingId,
        cleaner_id: cleanerId,
        completed_at: now,
      },
    });

    if (!isBookingCompletedRouterEnabled()) {
      void notifyBookingEvent({ type: "completed", supabase: admin, bookingId });
    }

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

    traceCleanerLifecycle({
      outcome: "success",
      bookingId,
      cleanerId,
      action,
      bookingStatus: "completed",
      cleanerResponseStatus: CLEANER_RESPONSE.COMPLETED,
      dispatchStatus: bRow.dispatch_status,
      httpStatus: 200,
    });
    return { status: 200, json: { ok: true, status: "completed" } };
  }

  traceCleanerLifecycle({
    outcome: "blocked",
    bookingId,
    cleanerId,
    action,
    bookingStatus: st,
    cleanerResponseStatus: bRow.cleaner_response_status,
    dispatchStatus: bRow.dispatch_status,
    httpStatus: 400,
    reasonCode: CLEANER_LIFECYCLE_CODE.UNSUPPORTED,
  });
  return { status: 400, json: { error: "Unsupported.", code: CLEANER_LIFECYCLE_CODE.UNSUPPORTED } };
}
