/**
 * Canonical booking operation gateway.
 *
 * This file is the gradual consolidation layer for booking mutations.
 * It must wrap existing production-safe logic first.
 *
 * Rules:
 * - Do not create new booking truth here.
 * - Do not duplicate lifecycle derivation.
 * - Do not send notifications directly.
 * - Do not bypass existing idempotency.
 * - Each command should eventually emit one canonical event.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinalizePaystackChargeSuccessParams } from "@/lib/booking/finalizePaystackChargeSuccess";
import { finalizePaystackChargeSuccess } from "@/lib/booking/finalizePaystackChargeSuccess";
import type { UpsertBookingFromPaystackResult } from "@/lib/booking/upsertBookingFromPaystack";
import {
  runCleanerBookingLifecycleAction,
  type CleanerLifecycleAction,
} from "@/lib/cleaner/runCleanerBookingLifecycleAction";
import {
  buildBookingEvent,
  type CanonicalBookingEvent,
  type CanonicalBookingEventActor,
  type CanonicalBookingEventType,
} from "@/lib/booking/bookingEvents";
import {
  isBookingCompletedRouterEnabled,
  isBookingNotificationRouterEnabled,
  routeBookingNotificationEvent,
} from "@/lib/notifications/notificationRouter";
import type { BookingFallbackReason } from "@/lib/booking/fallbackReason";
import { assignCleanerToBooking as dispatchAssignCleanerToBooking } from "@/lib/dispatch/assignCleaner";
import type { AssignCleanerOptions, AssignResult } from "@/lib/dispatch/assignCleaner";
import { maybeRedispatchPendingBookingIfOffersExhausted } from "@/lib/dispatch/redispatchAfterOfferReject";
import {
  performAdminAssignTeam,
  type AdminAssignTeamOptions,
  type AdminAssignTeamResult,
} from "@/lib/admin/performAdminAssignTeam";
import {
  performAdminRetryDispatchBooking,
  type AdminRetryDispatchBookingParams,
  type AdminRetryDispatchHttpResult,
  type AdminRetryDispatchSuccessBody,
} from "@/lib/admin/performAdminRetryDispatchBooking";
import { performAdminAssignToCleaner } from "@/lib/admin/performAdminAssignToCleaner";
import { performAdminDirectAssignToCleaner } from "@/lib/admin/performAdminDirectAssignToCleaner";
import { runAdminAssignSmart, type RunAdminAssignSmartParams } from "@/lib/admin/runAdminAssignSmart";
import {
  adminMarkBookingPaid,
  adminRecordBookingDeposit,
  type AdminMarkBookingPaidResult,
  type AdminMarkPaidMethod,
} from "@/lib/booking/adminMarkBookingPaid";
import type { AdminWarning } from "@/lib/admin/adminWarningPayload";
import {
  adminEditBookingDetailsNotesOnly,
  adminEditBookingDetailsRepricingOnly,
  type AdminEditBookingDetailsBody,
  type AdminEditBookingDetailsResult,
} from "@/lib/booking/adminEditBookingDetails";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import {
  insertRecurringOccurrenceBooking,
  type RecurringRowForInsert,
} from "@/lib/recurring/insertRecurringOccurrenceBooking";
import { insertMonthlyRecurringOccurrenceBooking } from "@/lib/recurring/insertMonthlyRecurringOccurrenceBooking";
import { refreshRecurringPaymentStateForBooking } from "@/lib/recurring/refreshRecurringPaymentStateForBooking";

export type BookingOperationResult<T = unknown> =
  | {
      ok: true;
      bookingId?: string;
      data?: T;
      /** Populated on success; not persisted or dispatched. */
      event?: CanonicalBookingEvent;
    }
  | {
      ok: false;
      bookingId?: string;
      code: string;
      message: string;
      cause?: unknown;
      /** Original HTTP status when the wrapped route used `NextResponse.json(body, { status })`. */
      httpStatus?: number;
    };

/** Required success payload for {@link generateRecurringOccurrenceBooking} / {@link generateMonthlyRecurringOccurrenceBooking}. */
export type RecurringOccurrenceGenerationData = {
  paystackReference: string;
};

export type RecurringOccurrenceGenerationSuccess = {
  ok: true;
  bookingId: string;
  data: RecurringOccurrenceGenerationData;
  /** Draft only; not persisted or dispatched by these gateways. */
  event?: CanonicalBookingEvent;
};

export type RecurringOccurrenceGenerationFailure = {
  ok: false;
  bookingId?: string;
  code: string;
  message: string;
  cause?: unknown;
  httpStatus?: number;
};

export type RecurringOccurrenceGenerationResult = RecurringOccurrenceGenerationSuccess | RecurringOccurrenceGenerationFailure;

function finalizeActor(source: FinalizePaystackChargeSuccessParams["source"]): CanonicalBookingEventActor {
  if (source === "webhook") return "paystack";
  if (source === "retry") return "cron";
  return "system";
}

/**
 * Maps {@link finalizePaidBooking} result to the legacy `upsertBookingFromPaystack` result shape
 * for routes/crons that already branch on `result.error`, `result.bookingId`, etc.
 */
export function upsertResultFromFinalizePaidBookingOp(
  op: BookingOperationResult<Awaited<ReturnType<typeof finalizePaystackChargeSuccess>>>,
): UpsertBookingFromPaystackResult {
  if (op.ok && op.data) return op.data;
  if (!op.ok && op.cause && typeof op.cause === "object" && "ok" in op.cause) {
    return op.cause as UpsertBookingFromPaystackResult;
  }
  if (!op.ok) {
    return {
      ok: false,
      skipped: true,
      bookingId: op.bookingId ?? null,
      error: op.message,
    };
  }
  return { ok: false, skipped: true, bookingId: null, error: "Finalize returned no data." };
}

/**
 * Wraps {@link finalizePaystackChargeSuccess} (Paystack charge success → upsert + existing side effects).
 * Does not add notification calls; delegates entirely to the current implementation.
 */
export async function finalizePaidBooking(
  params: FinalizePaystackChargeSuccessParams,
): Promise<BookingOperationResult<Awaited<ReturnType<typeof finalizePaystackChargeSuccess>>>> {
  let data: Awaited<ReturnType<typeof finalizePaystackChargeSuccess>>;
  try {
    data = await finalizePaystackChargeSuccess(params);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, code: "finalize_threw", message, cause };
  }

  const persistFailed = Boolean(data.error) || data.ok === false;
  if (persistFailed) {
    const code =
      data.reason === "amount_mismatch"
        ? "payment_amount_mismatch"
        : data.reason === "currency_mismatch"
          ? "payment_currency_mismatch"
          : data.reason === "booking_mismatch"
            ? "payment_booking_mismatch"
            : data.reason === "finalization_failed"
              ? "payment_finalization_failed"
              : "payment_finalize_failed";
    const message = data.error?.trim() || "Payment finalize did not complete successfully.";
    return {
      ok: false,
      bookingId: data.bookingId ?? undefined,
      code,
      message,
      cause: data,
    };
  }

  const bookingId = data.bookingId ?? undefined;
  const event: CanonicalBookingEvent | undefined =
    bookingId != null
      ? buildBookingEvent({
          type: "booking.payment_succeeded",
          bookingId,
          actor: finalizeActor(params.source),
          metadata: {
            paystackReference: params.paystackReference,
            skipped: data.skipped,
            persistSource: params.source,
          },
          externalRef: params.paystackReference,
        })
      : undefined;

  if (event && isBookingNotificationRouterEnabled()) {
    try {
      await routeBookingNotificationEvent(event);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      await reportOperationalIssue("warn", "bookingOperations/routeBookingNotificationEvent", message, {
        bookingId: bookingId ?? null,
        idempotencyKey: event.idempotencyKey,
      });
    }
  }

  return { ok: true, bookingId, data, event };
}

export type RefreshRecurringBookingPaymentStateArgs = {
  admin: SupabaseClient;
  bookingId: string;
};

/**
 * Thin gateway for recurring-derived `bookings.payment_state` projection only.
 * Delegates to {@link refreshRecurringPaymentStateForBooking}; does not invoke Paystack, notifications, or payouts.
 */
export async function refreshRecurringBookingPaymentState(
  args: RefreshRecurringBookingPaymentStateArgs,
): Promise<void> {
  await refreshRecurringPaymentStateForBooking(args.admin, args.bookingId);
}

export type GenerateRecurringOccurrenceBookingArgs = {
  admin: SupabaseClient;
  recurring: RecurringRowForInsert;
  occurrenceDateYmd: string;
  customerEmail: string;
  customerName: string | null;
  customerPhone: string | null;
};

function mapRecurringOccurrenceInsertToOp(
  out:
    | { ok: true; bookingId: string; paystackReference: string }
    | { ok: false; error: string },
  rail: "per_booking_recurring" | "monthly_invoice_recurring",
): RecurringOccurrenceGenerationResult {
  if (out.ok) {
    return {
      ok: true,
      bookingId: out.bookingId,
      data: { paystackReference: out.paystackReference },
      event: buildBookingEvent({
        type: "booking.recurring_generated",
        bookingId: out.bookingId,
        actor: "cron",
        metadata: { rail },
        externalRef: out.paystackReference,
      }),
    };
  }
  const code = out.error === "duplicate_occurrence" ? "duplicate_occurrence" : "recurring_occurrence_insert_failed";
  return { ok: false, code, message: out.error };
}

/**
 * Command-layer gateway for per-booking recurring occurrence inserts (`pending_payment`, Paystack `rec_*`).
 * Delegates to {@link insertRecurringOccurrenceBooking} only — no cursor updates, no payment_state refresh, no Paystack/notifications.
 */
export async function generateRecurringOccurrenceBooking(
  args: GenerateRecurringOccurrenceBookingArgs,
): Promise<RecurringOccurrenceGenerationResult> {
  const out = await insertRecurringOccurrenceBooking(args.admin, {
    recurring: args.recurring,
    occurrenceDateYmd: args.occurrenceDateYmd,
    customerEmail: args.customerEmail,
    customerName: args.customerName,
    customerPhone: args.customerPhone,
  });
  return mapRecurringOccurrenceInsertToOp(out, "per_booking_recurring");
}

/**
 * Command-layer gateway for monthly-invoice recurring occurrence inserts (`pending`, `pending_monthly`, `mi_bkg_*`).
 * Delegates to {@link insertMonthlyRecurringOccurrenceBooking} only — separate billing rail from {@link generateRecurringOccurrenceBooking}.
 */
export async function generateMonthlyRecurringOccurrenceBooking(
  args: GenerateRecurringOccurrenceBookingArgs,
): Promise<RecurringOccurrenceGenerationResult> {
  const out = await insertMonthlyRecurringOccurrenceBooking(args.admin, {
    recurring: args.recurring,
    occurrenceDateYmd: args.occurrenceDateYmd,
    customerEmail: args.customerEmail,
    customerName: args.customerName,
    customerPhone: args.customerPhone,
  });
  return mapRecurringOccurrenceInsertToOp(out, "monthly_invoice_recurring");
}

export type CleanerLifecycleOperationArgs = {
  admin: SupabaseClient;
  cleanerId: string;
  bookingId: string;
};

async function runCleanerLifecycleOperation(
  args: CleanerLifecycleOperationArgs,
  action: CleanerLifecycleAction,
  eventType: CanonicalBookingEventType,
): Promise<BookingOperationResult<Record<string, unknown>>> {
  const { admin, cleanerId, bookingId } = args;
  const out = await runCleanerBookingLifecycleAction({ admin, cleanerId, bookingId, action });
  const body = out.json;
  const message =
    typeof body.error === "string"
      ? body.error
      : typeof body.message === "string"
        ? body.message
        : `Lifecycle action failed (HTTP ${out.status}).`;
  const code = typeof body.code === "string" ? body.code : `http_${out.status}`;

  if (out.status < 200 || out.status >= 300) {
    return { ok: false, bookingId, code, message, cause: body, httpStatus: out.status };
  }

  return {
    ok: true,
    bookingId,
    data: body,
    event: buildBookingEvent({
      type: eventType,
      bookingId,
      actor: "cleaner",
      metadata: { action },
      externalRef: action,
    }),
  };
}

export function cleanerAcceptBooking(args: CleanerLifecycleOperationArgs): Promise<BookingOperationResult<Record<string, unknown>>> {
  return runCleanerLifecycleOperation(args, "accept", "booking.cleaner_accepted");
}

export function cleanerRejectBooking(args: CleanerLifecycleOperationArgs): Promise<BookingOperationResult<Record<string, unknown>>> {
  return runCleanerLifecycleOperation(args, "reject", "booking.cleaner_rejected");
}

export function markCleanerOnTheWay(args: CleanerLifecycleOperationArgs): Promise<BookingOperationResult<Record<string, unknown>>> {
  return runCleanerLifecycleOperation(args, "en_route", "booking.cleaner_on_the_way");
}

/**
 * Current production schema has no separate DB step for “arrived”; it maps to the same lifecycle action as {@link markBookingStarted}.
 * Callers should prefer {@link markBookingStarted} unless product copy distinguishes arrived vs started.
 */
export function markCleanerArrived(args: CleanerLifecycleOperationArgs): Promise<BookingOperationResult<Record<string, unknown>>> {
  return runCleanerLifecycleOperation(args, "start", "booking.cleaner_arrived");
}

export function markBookingStarted(args: CleanerLifecycleOperationArgs): Promise<BookingOperationResult<Record<string, unknown>>> {
  return runCleanerLifecycleOperation(args, "start", "booking.started");
}

export async function markBookingCompleted(
  args: CleanerLifecycleOperationArgs,
): Promise<BookingOperationResult<Record<string, unknown>>> {
  const out = await runCleanerLifecycleOperation(args, "complete", "booking.completed");
  if (out.ok && out.event && isBookingCompletedRouterEnabled()) {
    try {
      const nav = await routeBookingNotificationEvent(out.event, { admin: args.admin });
      if (!nav.ok) {
        await reportOperationalIssue("warn", "bookingOperations/routeBookingNotificationEvent(completed)", nav.message, {
          bookingId: args.bookingId,
          idempotencyKey: out.event.idempotencyKey,
          code: nav.code,
        });
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      await reportOperationalIssue("warn", "bookingOperations/routeBookingNotificationEvent(completed)", message, {
        bookingId: args.bookingId,
        idempotencyKey: out.event.idempotencyKey,
      });
    }
  }
  return out;
}

export type RedispatchBookingParams = {
  admin: SupabaseClient;
  bookingId: string;
  rejectedCleanerId: string;
  reassignmentFallbackReason?: BookingFallbackReason;
  skipBackoffScheduling?: boolean;
};

/**
 * Wraps `assignCleanerToBooking` from `@/lib/dispatch/assignCleaner` (smart assign + location resolution). Does not send extra notifications.
 */
export async function assignCleanerToBooking(
  admin: SupabaseClient,
  bookingId: string,
  options?: AssignCleanerOptions,
): Promise<BookingOperationResult<AssignResult>> {
  const inner = await dispatchAssignCleanerToBooking(admin, bookingId, options);
  if (!inner.ok) {
    return {
      ok: false,
      bookingId,
      code: inner.error,
      message: inner.message?.trim() || inner.error,
      cause: inner,
    };
  }
  const event = buildBookingEvent({
    type: "booking.assigned",
    bookingId,
    actor: "system",
    metadata: { cleanerId: inner.cleanerId, gateway: "dispatch.assignCleanerToBooking" },
    externalRef: inner.cleanerId,
  });
  return { ok: true, bookingId, data: inner, event };
}

/**
 * Wraps `maybeRedispatchPendingBookingIfOffersExhausted` (user-selected offer decline / recovery). Void upstream.
 * Event draft uses `booking.cleaner_rejected` as the orchestration signal (re-offer / recovery wave), not a DB truth claim.
 */
export async function redispatchBooking(params: RedispatchBookingParams): Promise<BookingOperationResult<void>> {
  await maybeRedispatchPendingBookingIfOffersExhausted(params.admin, {
    bookingId: params.bookingId,
    rejectedCleanerId: params.rejectedCleanerId,
    reassignmentFallbackReason: params.reassignmentFallbackReason,
    skipBackoffScheduling: params.skipBackoffScheduling,
  });
  const event = buildBookingEvent({
    type: "booking.cleaner_rejected",
    bookingId: params.bookingId,
    actor: "system",
    metadata: {
      rejectedCleanerId: params.rejectedCleanerId,
      gateway: "dispatch.maybeRedispatchPendingBookingIfOffersExhausted",
    },
    externalRef: params.rejectedCleanerId,
  });
  return { ok: true, bookingId: params.bookingId, data: undefined, event };
}

/** Wraps {@link performAdminAssignTeam} (team + roster sync). */
export async function adminAssignTeamToBooking(
  opts: AdminAssignTeamOptions,
): Promise<BookingOperationResult<AdminAssignTeamResult>> {
  const inner = await performAdminAssignTeam(opts);
  if (!inner.ok) {
    return {
      ok: false,
      bookingId: opts.bookingId,
      code: `admin_assign_team_http_${inner.httpStatus}`,
      message: inner.error,
      cause: inner,
      httpStatus: inner.httpStatus,
    };
  }
  const event = buildBookingEvent({
    type: "booking.assigned",
    bookingId: opts.bookingId,
    actor: "admin",
    metadata: {
      teamId: inner.teamId,
      oldTeamId: inner.oldTeamId,
      adminUserId: opts.adminUserId,
      gateway: "performAdminAssignTeam",
    },
    externalRef: inner.teamId,
  });
  return { ok: true, bookingId: opts.bookingId, data: inner, event };
}

function retryDispatchErrorMessage(body: AdminRetryDispatchHttpResult["body"]): string {
  if (typeof body === "object" && body !== null && "error" in body && typeof (body as { error?: unknown }).error === "string") {
    return (body as { error: string }).error;
  }
  return "Retry dispatch failed.";
}

export type RetryDispatchBookingArgs = AdminRetryDispatchBookingParams;

/**
 * Wraps {@link performAdminRetryDispatchBooking} (admin terminal dispatch reset + one soft `ensureBookingAssignment` wave).
 * Draft-only `booking.assigned` on success (post-assign); not dispatched.
 */
export async function retryDispatchBooking(
  args: RetryDispatchBookingArgs,
): Promise<BookingOperationResult<AdminRetryDispatchSuccessBody>> {
  const inner = await performAdminRetryDispatchBooking(args);
  if (inner.status !== 200) {
    return {
      ok: false,
      bookingId: args.bookingId,
      code: `retry_dispatch_http_${inner.status}`,
      message: retryDispatchErrorMessage(inner.body),
      httpStatus: inner.status,
      cause: inner,
    };
  }
  const data = inner.body;
  const externalRef = data.assignmentKind === "individual" ? data.cleanerId : data.teamId;
  const event = buildBookingEvent({
    type: "booking.assigned",
    bookingId: args.bookingId,
    actor: "admin",
    metadata: {
      gateway: "performAdminRetryDispatchBooking",
      assignmentKind: data.assignmentKind,
      ...(data.assignmentKind === "individual" ? { cleanerId: data.cleanerId } : { teamId: data.teamId }),
    },
    externalRef,
  });
  return { ok: true, bookingId: args.bookingId, data, event };
}

export type AdminAssignCleanerToBookingArgs = {
  admin: SupabaseClient;
  bookingId: string;
  cleanerId: string;
  force: boolean;
};

/** Success body matches `POST /api/admin/bookings/[id]/assign` JSON (`expiresAt` not `expiresAtIso`). */
export type AdminAssignCleanerToBookingSuccessBody = {
  ok: true;
  cleanerId: string;
  offerId: string;
  expiresAt: string;
  warnings?: AdminWarning[];
};

/**
 * Wraps {@link performAdminAssignToCleaner} (admin manual offer to one cleaner). Draft-only `booking.assigned`; not dispatched.
 */
export async function adminAssignCleanerToBooking(
  args: AdminAssignCleanerToBookingArgs,
): Promise<BookingOperationResult<AdminAssignCleanerToBookingSuccessBody>> {
  const inner = await performAdminAssignToCleaner(args.admin, {
    bookingId: args.bookingId,
    cleanerId: args.cleanerId,
    force: args.force,
  });
  if (!inner.ok) {
    return {
      ok: false,
      bookingId: args.bookingId,
      code: `admin_assign_cleaner_http_${inner.httpStatus}`,
      message: inner.error,
      cause: { error: inner.error, ...(inner.warnings ? { warnings: inner.warnings } : {}) },
      httpStatus: inner.httpStatus,
    };
  }
  const data: AdminAssignCleanerToBookingSuccessBody = {
    ok: true,
    cleanerId: inner.cleanerId,
    offerId: inner.offerId,
    expiresAt: inner.expiresAtIso,
    ...(inner.warnings ? { warnings: inner.warnings } : {}),
  };
  const event = buildBookingEvent({
    type: "booking.assigned",
    bookingId: args.bookingId,
    actor: "admin",
    metadata: {
      cleanerId: inner.cleanerId,
      offerId: inner.offerId,
      gateway: "performAdminAssignToCleaner",
    },
    externalRef: inner.cleanerId,
  });
  return { ok: true, bookingId: args.bookingId, data, event };
}

export type AdminDirectAssignCleanerToBookingSuccessBody = {
  ok: true;
  cleanerId: string;
  alreadyAssigned?: boolean;
  warnings?: AdminWarning[];
};

/** Admin immediate assign (no dispatch offer); notifies cleaner via assigned flow. */
export async function adminDirectAssignCleanerToBooking(
  args: AdminAssignCleanerToBookingArgs,
): Promise<BookingOperationResult<AdminDirectAssignCleanerToBookingSuccessBody>> {
  const inner = await performAdminDirectAssignToCleaner(args.admin, {
    bookingId: args.bookingId,
    cleanerId: args.cleanerId,
    force: args.force,
  });
  if (!inner.ok) {
    return {
      ok: false,
      bookingId: args.bookingId,
      code: `admin_direct_assign_http_${inner.httpStatus}`,
      message: inner.error,
      cause: { error: inner.error, ...(inner.warnings ? { warnings: inner.warnings } : {}) },
      httpStatus: inner.httpStatus,
    };
  }
  const data: AdminDirectAssignCleanerToBookingSuccessBody = {
    ok: true,
    cleanerId: inner.cleanerId,
    ...(inner.alreadyAssigned ? { alreadyAssigned: true } : {}),
    ...(inner.warnings ? { warnings: inner.warnings } : {}),
  };
  const event = buildBookingEvent({
    type: "booking.assigned",
    bookingId: args.bookingId,
    actor: "admin",
    metadata: {
      cleanerId: inner.cleanerId,
      gateway: "performAdminDirectAssignToCleaner",
      direct: true,
    },
    externalRef: inner.cleanerId,
  });
  return { ok: true, bookingId: args.bookingId, data, event };
}

export type AdminSmartAssignBookingArgs = { admin: SupabaseClient } & RunAdminAssignSmartParams;

/** Success body matches `POST /api/admin/bookings/[id]/assign-smart` JSON. */
export type AdminSmartAssignBookingSuccessBody = {
  ok: true;
  cleanerId: string;
  offerId: string;
  expiresAt: string;
  attempts: number;
};

/**
 * Wraps {@link runAdminAssignSmart} (ranked cascade assign). Draft-only `booking.assigned` on success; not dispatched.
 * Failures preserve assign-smart’s **422** + `{ ok: false, error, attempts, escalated }` contract.
 */
export async function adminSmartAssignBooking(
  args: AdminSmartAssignBookingArgs,
): Promise<BookingOperationResult<AdminSmartAssignBookingSuccessBody>> {
  const { admin, ...params } = args;
  const bookingId = params.bookingId;
  const result = await runAdminAssignSmart(admin, params);

  if (result.ok) {
    const data: AdminSmartAssignBookingSuccessBody = {
      ok: true,
      cleanerId: result.cleanerId,
      offerId: result.offerId,
      expiresAt: result.expiresAt,
      attempts: result.attempts,
    };
    const event = buildBookingEvent({
      type: "booking.assigned",
      bookingId,
      actor: "admin",
      metadata: {
        cleanerId: result.cleanerId,
        offerId: result.offerId,
        gateway: "runAdminAssignSmart",
        attempts: result.attempts,
      },
      externalRef: result.cleanerId,
    });
    return { ok: true, bookingId, data, event };
  }

  const cause = {
    ok: false as const,
    error: result.error,
    attempts: result.attempts,
    escalated: Boolean(result.escalated),
  };
  return {
    ok: false,
    bookingId,
    code: "admin_smart_assign_failed",
    message: result.error,
    cause,
    httpStatus: 422,
  };
}

/** Normalized payload for {@link adminMarkBookingPaidOperation} (route maps back to legacy JSON). */
export type AdminMarkBookingPaidOperationData =
  | { variant: "deposit_recorded"; deposit_paid_cents: number }
  | { variant: "full_skipped"; reason: "already_paid" }
  | {
      variant: "full_settled";
      settlement: Extract<AdminMarkBookingPaidResult, { ok: true; marked_paid: true }>["settlement"];
    };

export type AdminMarkBookingPaidOperationArgs = {
  admin: SupabaseClient;
  bookingId: string;
  adminUserId: string;
  method: AdminMarkPaidMethod;
  reference?: string | null;
  /** Positive override only (same semantics as {@link adminMarkBookingPaid}). */
  amountCentsOverride?: number | null;
  settlementMode: "full" | "deposit";
  depositCents?: number;
  depositReason?: string;
};

/**
 * Thin wrapper for admin off-platform settlement (`cash` / `zoho` / `eft`).
 * Delegates to {@link adminMarkBookingPaid} / {@link adminRecordBookingDeposit} unchanged — no Paystack finalize.
 * Emits a draft `booking.payment_succeeded` event only when a new full settlement is recorded (not deposit / not skipped).
 * Does not call {@link routeBookingNotificationEvent}; manual SMS/email behavior stays inside the delegated impl.
 */
export async function adminMarkBookingPaidOperation(
  args: AdminMarkBookingPaidOperationArgs,
): Promise<BookingOperationResult<AdminMarkBookingPaidOperationData>> {
  const { admin, bookingId, adminUserId, method, reference, amountCentsOverride, settlementMode } = args;

  if (settlementMode === "deposit") {
    const depositCents =
      args.depositCents != null && Number.isFinite(Number(args.depositCents))
        ? Math.round(Number(args.depositCents))
        : NaN;
    const reason = typeof args.depositReason === "string" ? args.depositReason : "";
    const dep = await adminRecordBookingDeposit(admin, {
      bookingId,
      depositCents,
      method,
      reference: reference ?? null,
      reason,
      adminUserId,
    });
    if (!dep.ok) {
      return {
        ok: false,
        bookingId,
        code: `admin_mark_paid_deposit_${dep.httpStatus}`,
        message: dep.error,
        httpStatus: dep.httpStatus,
        cause: dep,
      };
    }
    return {
      ok: true,
      bookingId,
      data: { variant: "deposit_recorded", deposit_paid_cents: dep.deposit_paid_cents },
    };
  }

  const result = await adminMarkBookingPaid(admin, {
    bookingId,
    method,
    reference,
    amountCentsOverride:
      amountCentsOverride != null && Number(amountCentsOverride) > 0 ? Math.round(Number(amountCentsOverride)) : null,
    adminUserId,
  });

  if (!result.ok) {
    return {
      ok: false,
      bookingId,
      code: `admin_mark_paid_${result.httpStatus}`,
      message: result.error,
      httpStatus: result.httpStatus,
      cause: result,
    };
  }

  if ("skipped" in result && result.skipped) {
    return {
      ok: true,
      bookingId,
      data: { variant: "full_skipped", reason: result.reason },
    };
  }

  if ("marked_paid" in result && result.marked_paid && "settlement" in result) {
    const { settlement } = result;
    const externalReference =
      settlement.payment_reference_external != null && String(settlement.payment_reference_external).trim()
        ? String(settlement.payment_reference_external).trim()
        : settlement.paystack_reference;
    const event = buildBookingEvent({
      type: "booking.payment_succeeded",
      bookingId,
      actor: "admin",
      metadata: {
        source: "admin_manual",
        method: settlement.method,
        settlementMode: "full",
        externalReference,
      },
      externalRef: settlement.paystack_reference,
    });
    return {
      ok: true,
      bookingId,
      data: { variant: "full_settled", settlement },
      event,
    };
  }

  return {
    ok: false,
    bookingId,
    code: "admin_mark_paid_unexpected",
    message: "Unexpected mark-paid result.",
    httpStatus: 500,
    cause: result,
  };
}

export type AdminUpdateBookingNotesArgs = {
  admin: SupabaseClient;
  bookingId: string;
  body: AdminEditBookingDetailsBody;
  adminUserId: string;
  idempotencyKey?: string | null;
};

/**
 * Thin wrapper: admin edit-details notes-only (`booking_snapshot.admin_notes`).
 * Delegates to {@link adminEditBookingDetailsNotesOnly}; no notification router, events, repricing, or earnings side effects.
 */
export async function adminUpdateBookingNotes(args: AdminUpdateBookingNotesArgs): Promise<AdminEditBookingDetailsResult> {
  return adminEditBookingDetailsNotesOnly(args.admin, {
    bookingId: args.bookingId,
    body: args.body,
    adminUserId: args.adminUserId,
    idempotencyKey: args.idempotencyKey,
  });
}

export type AdminRepriceBookingArgs = AdminUpdateBookingNotesArgs;

/**
 * Thin wrapper: admin edit-details repricing (rooms/baths/extras, paid sync, line RPC, earnings reset, payout persist).
 * Delegates to {@link adminEditBookingDetailsRepricingOnly}; no notification router or event dispatch.
 */
export async function adminRepriceBooking(args: AdminRepriceBookingArgs): Promise<AdminEditBookingDetailsResult> {
  return adminEditBookingDetailsRepricingOnly(args.admin, {
    bookingId: args.bookingId,
    body: args.body,
    adminUserId: args.adminUserId,
    idempotencyKey: args.idempotencyKey,
  });
}
