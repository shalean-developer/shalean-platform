import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { runAdminAssignSmart } from "@/lib/admin/runAdminAssignSmart";
import { assignBestCleaner } from "@/lib/marketplace-intelligence/assignBestCleaner";
import { notifyCleanerAssignedBooking } from "@/lib/dispatch/notifyCleanerAssigned";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { metrics } from "@/lib/metrics/counters";

/**
 * Stable audit code stamped on `bookings.fallback_reason` and emitted in
 * `metrics` / `system_logs` whenever this fallback recovers (or attempts
 * to recover) a paid booking after a customer-selected `dispatch_offers`
 * insert failed in `upsertBookingFromPaystack`.
 *
 * Search keys for ops:
 *   - bookings.fallback_reason = 'selected_cleaner_offer_insert_failed'
 *   - system_logs.source IN ('checkout_offer_insert_fallback_recovered',
 *                            'checkout_offer_insert_fallback_unrecovered')
 *   - metric "booking.checkout_assignment" with phase like
 *     'offer_insert_failed_*'.
 */
export const SELECTED_CLEANER_OFFER_INSERT_FAILED_REASON =
  "selected_cleaner_offer_insert_failed" as const;

export type DispatchFallbackResult =
  | {
      recovered: true;
      recoveryKind: "auto_dispatch" | "admin_smart_fallback";
      cleanerId: string | null;
      teamId: string | null;
    }
  | { recovered: false; recoveryKind: null };

/**
 * Production Readiness Audit H-7.
 *
 * Pre-fix `upsertBookingFromPaystack` only escalated to ops when the
 * customer-selected `dispatch_offers` insert failed AFTER successful
 * payment. The booking row was left at `status='pending_assignment'`,
 * `cleaner_id=null`, and `selected_cleaner_id=<user pick>` with no
 * pending offer — so a paid customer could wait indefinitely with no
 * cleaner ever attempted.
 *
 * This helper is invoked AFTER `escalateFailedCheckoutDispatchOffer`
 * (which keeps the ops paper trail). It runs the same auto-dispatch
 * ladder used by the no-pick branch:
 *   1. `assignBestCleaner` (smart auto-assign, excluding the cleaner
 *      whose offer insert failed so we don't immediately retry the
 *      same broken row).
 *   2. If `AUTO_DISPATCH_CLEANERS=false` OR `assignBestCleaner` returns
 *      not-ok AND `CHECKOUT_ADMIN_OFFER_ASSIGN_FALLBACK=true`, fall
 *      back to `runAdminAssignSmart`.
 *
 * On recovery the booking gets `fallback_reason =
 * SELECTED_CLEANER_OFFER_INSERT_FAILED_REASON` (only when previously
 * NULL — never overwritten) plus the existing assignee notification.
 * `assignment_type` is preserved (`'user_selected'`) so the audit trail
 * still shows the customer's original intent.
 *
 * On non-recovery a `*_unrecovered` log entry is emitted so ops can
 * separate "stranded but recovered" from "still stranded after
 * fallback" — the original `escalateFailedCheckoutDispatchOffer`
 * `payment_needs_follow_up=true` flag still applies.
 *
 * Isolation:
 *   - Does NOT change payment finalization, payout calculations,
 *     pricing, or refund logic.
 *   - Does NOT touch the offer-success path.
 *   - Reuses the existing assignment helpers without modification.
 */
export async function dispatchFallbackAfterSelectedCleanerOfferInsertFailure(params: {
  supabase: SupabaseClient;
  bookingId: string;
  paystackReference: string;
  /** The cleaner whose `dispatch_offers` insert failed; excluded from the smart re-attempt. */
  failedSelectedCleanerId: string;
}): Promise<DispatchFallbackResult> {
  const { supabase, bookingId, paystackReference, failedSelectedCleanerId } = params;

  const autoDispatchEnabled = process.env.AUTO_DISPATCH_CLEANERS !== "false";
  const offerAssignFallback = process.env.CHECKOUT_ADMIN_OFFER_ASSIGN_FALLBACK === "true";

  let result: DispatchFallbackResult = { recovered: false, recoveryKind: null };

  try {
    if (autoDispatchEnabled) {
      const r = await assignBestCleaner(supabase, bookingId, {
        source: "paystack_checkout_offer_failure_fallback",
        smartAssign: { excludeCleanerIds: [failedSelectedCleanerId] as const },
      });
      const fresh = r.ok && !(r as { noOp?: boolean }).noOp;
      if (fresh && r.ok) {
        result = {
          recovered: true,
          recoveryKind: "auto_dispatch",
          cleanerId: r.assignmentKind === "individual" ? r.cleanerId : null,
          teamId: r.assignmentKind === "team" ? r.teamId : null,
        };
        if (r.assignmentKind === "individual") {
          await notifyCleanerAssignedBooking(supabase, bookingId, r.cleanerId);
        }
      } else if (!r.ok && offerAssignFallback) {
        const smart = await runAdminAssignSmart(supabase, {
          bookingId,
          force: false,
          maxAttempts: 25,
          cleanerIds: null,
          autoEscalateExtremeSla: null,
        });
        if (smart.ok) {
          result = {
            recovered: true,
            recoveryKind: "admin_smart_fallback",
            cleanerId: smart.cleanerId,
            teamId: null,
          };
          await notifyCleanerAssignedBooking(supabase, bookingId, smart.cleanerId);
        }
      }
    } else if (offerAssignFallback) {
      const smart = await runAdminAssignSmart(supabase, {
        bookingId,
        force: false,
        maxAttempts: 25,
        cleanerIds: null,
        autoEscalateExtremeSla: null,
      });
      if (smart.ok) {
        result = {
          recovered: true,
          recoveryKind: "admin_smart_fallback",
          cleanerId: smart.cleanerId,
          teamId: null,
        };
        await notifyCleanerAssignedBooking(supabase, bookingId, smart.cleanerId);
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await reportOperationalIssue(
      "warn",
      "checkoutDispatchOfferFailureFallback",
      `auto-dispatch fallback threw: ${msg.slice(0, 300)}`,
      { bookingId, paystackReference, failedSelectedCleanerId },
    );
  }

  if (result.recovered) {
    /*
     * Stamp `fallback_reason` for audit trail, but only when previously
     * NULL — never overwrite a more specific reason that another
     * sub-system (e.g. the resolver-level "fallback" path) might already
     * have set.
     */
    const { error: updErr } = await supabase
      .from("bookings")
      .update({ fallback_reason: SELECTED_CLEANER_OFFER_INSERT_FAILED_REASON })
      .eq("id", bookingId)
      .is("fallback_reason", null);
    if (updErr) {
      await reportOperationalIssue(
        "warn",
        "checkoutDispatchOfferFailureFallback",
        `fallback_reason stamp failed: ${updErr.message.slice(0, 300)}`,
        { bookingId, paystackReference, failedSelectedCleanerId },
      );
    }
    metrics.increment("booking.checkout_assignment", {
      assignment_type: "auto_fallback",
      bookingId,
      selected_cleaner_id: failedSelectedCleanerId,
      assigned_cleaner_id: result.cleanerId,
      assigned_team_id: result.teamId,
      fallback_reason: SELECTED_CLEANER_OFFER_INSERT_FAILED_REASON,
      phase: "offer_insert_failed_recovered",
      recovery_kind: result.recoveryKind,
    });
    void logSystemEvent({
      level: "info",
      source: "checkout_offer_insert_fallback_recovered",
      message: "Auto-dispatch recovered booking after selected-cleaner offer insert failed",
      context: {
        bookingId,
        paystackReference,
        failedSelectedCleanerId,
        recoveryKind: result.recoveryKind,
        cleanerId: result.cleanerId,
        teamId: result.teamId,
      },
    });
  } else {
    metrics.increment("booking.checkout_assignment", {
      assignment_type: "auto_fallback",
      bookingId,
      selected_cleaner_id: failedSelectedCleanerId,
      fallback_reason: SELECTED_CLEANER_OFFER_INSERT_FAILED_REASON,
      phase: "offer_insert_failed_unrecovered",
    });
    void logSystemEvent({
      level: "warn",
      source: "checkout_offer_insert_fallback_unrecovered",
      message: "Auto-dispatch could not assign after selected-cleaner offer insert failed",
      context: {
        bookingId,
        paystackReference,
        failedSelectedCleanerId,
        autoDispatchEnabled,
        offerAssignFallback,
      },
    });
  }

  return result;
}
