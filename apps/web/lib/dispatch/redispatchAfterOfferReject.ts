import type { SupabaseClient } from "@supabase/supabase-js";
import { FALLBACK_REASON_CLEANER_REJECTED_OFFER, type BookingFallbackReason } from "@/lib/booking/fallbackReason";
import { maxDispatchAttempts } from "@/lib/dispatch/dispatchAttemptLimits";
import {
  applyDispatchBackoffJitter,
  backoffMsAfterUserSelectedRecoveryWave,
} from "@/lib/dispatch/dispatchRecoveryBackoff";
import { compactDispatchMetricTags } from "@/lib/dispatch/dispatchMetricContext";
import { ensureBookingAssignment } from "@/lib/dispatch/ensureBookingAssignment";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { metrics } from "@/lib/metrics/counters";
import {
  bumpRedispatchAttemptForBooking,
  markBookingPaymentNeedsFollowUp,
  markRedispatchMaxAttemptsFailed,
  scheduleRedispatchRecoveryBackoff,
  tagUserSelectedRedispatchFallback,
} from "@/lib/booking/assignmentBookingStateCommands";

/** Paid checkout “chosen cleaner” rows use `pending_assignment`; legacy paths may use `pending` or `offered`. */
const REDISPATCH_ELIGIBLE_BOOKING_STATUSES = ["pending", "pending_assignment", "offered"] as const;

function isRedispatchEligibleBookingStatus(st: string): boolean {
  return (REDISPATCH_ELIGIBLE_BOOKING_STATUSES as readonly string[]).includes(st);
}

/**
 * M-17: When a cleaner declines (or last parallel offer closes) and the booking is still
 * unassigned, return dispatch to searching and run smart assign excluding the rejecting cleaner.
 * This is the SINGLE canonical post-decline redispatch entry point — decline routes
 * (cleaner API, public token, WhatsApp webhook) MUST NOT call `ensureBookingAssignment`
 * separately, otherwise duplicate offers / notifications / metric inflation occur.
 *
 * Dedup primitive: an atomic compare-and-swap (CAS) on `bookings.dispatch_attempt_count`
 * means concurrent decline events (multi-tab decline, retried webhook, decline + cron
 * expiry colliding) only redispatch once — the loser's `expected` no longer matches.
 *
 * If the booking was `user_selected`, mark `auto_fallback` so ops/analytics reflect the
 * reassignment. Other assignment types (auto_dispatch / auto_fallback) keep their tag.
 *
 * Preserved escape hatches for genuine non-response (timeout) recovery:
 *  - `runDispatchTimeouts` still expires stale offers and enqueues `dispatch_retry_queue`.
 *  - `processUserSelectedOfferExpiryRedispatch` still calls this helper after lease claim.
 *  - `enqueueStrandedBookings` still re-injects orphaned bookings into the retry queue.
 */
export async function maybeRedispatchPendingBookingIfOffersExhausted(
  supabase: SupabaseClient,
  params: {
    bookingId: string;
    rejectedCleanerId: string;
    /** Defaults to decline; use `cleaner_offer_expired` when recovering from TTL expiry. */
    reassignmentFallbackReason?: BookingFallbackReason;
    /** Decline API: immediate next wave. Cron expiry: spaced via `dispatch_next_recovery_at`. */
    skipBackoffScheduling?: boolean;
  },
): Promise<void> {
  const reassignmentReason = params.reassignmentFallbackReason ?? FALLBACK_REASON_CLEANER_REJECTED_OFFER;
  const skipBackoff = params.skipBackoffScheduling === true;

  let didIncrement = false;
  let nextAttempts = 0;
  let waveAssignmentType: string | null = null;
  let isUserSelected = false;

  try {
    const { data: b, error: bErr } = await supabase
      .from("bookings")
      .select("id, status, cleaner_id, dispatch_status, assignment_type, selected_cleaner_id, dispatch_attempt_count")
      .eq("id", params.bookingId)
      .maybeSingle();

    if (bErr || !b) return;
    const st = String((b as { status?: string }).status ?? "").toLowerCase();
    if (!isRedispatchEligibleBookingStatus(st)) return;
    if ((b as { cleaner_id?: string | null }).cleaner_id) return;

    const at = String((b as { assignment_type?: string | null }).assignment_type ?? "").toLowerCase();
    isUserSelected = at === "user_selected";
    waveAssignmentType = at;

    const attempts = Number((b as { dispatch_attempt_count?: number | null }).dispatch_attempt_count ?? 0) || 0;
    const maxA = maxDispatchAttempts();
    if (attempts >= maxA) {
      const { error: failErr } = await markRedispatchMaxAttemptsFailed({
        admin: supabase,
        bookingId: params.bookingId,
        eligibleStatuses: REDISPATCH_ELIGIBLE_BOOKING_STATUSES,
      });
      if (failErr) {
        await reportOperationalIssue("warn", "redispatchAfterOfferReject", `mark failed: ${failErr.message}`, {
          bookingId: params.bookingId,
        });
      } else {
        await logSystemEvent({
          level: "warn",
          source: "dispatch_max_attempts",
          message: `User-selected dispatch recovery stopped after ${maxA} attempt(s)`,
          context: { bookingId: params.bookingId, dispatch_attempt_count: attempts },
        });
      }
      return;
    }

    const { count, error: cErr } = await supabase
      .from("dispatch_offers")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", params.bookingId)
      .eq("status", "pending");

    if (cErr) {
      await reportOperationalIssue("warn", "redispatchAfterOfferReject", `pending offers count: ${cErr.message}`, {
        bookingId: params.bookingId,
      });
      return;
    }
    if ((count ?? 0) > 0) return;

    const expected = attempts;
    nextAttempts = expected + 1;
    /**
     * M-17 dedup: CAS on `dispatch_attempt_count`. Two concurrent declines both observe
     * `attempts=N` and try `WHERE dispatch_attempt_count=N → SET=N+1` — Postgres serialises
     * the row update, so only one caller's WHERE still matches and gets a row back. The
     * loser sees `bumped=null` and no-ops. This is the *only* fence against duplicate
     * redispatch waves, so the filter intentionally does NOT pin assignment_type — it must
     * dedup auto_dispatch parallel declines as well as user_selected offer expiry.
     */
    const { data: bumped, error: bumpErr } = await bumpRedispatchAttemptForBooking({
      admin: supabase,
      bookingId: params.bookingId,
      eligibleStatuses: REDISPATCH_ELIGIBLE_BOOKING_STATUSES,
      expectedAttempts: expected,
      nextAttempts,
    });

    if (bumpErr) {
      await reportOperationalIssue("warn", "redispatchAfterOfferReject", `increment attempts: ${bumpErr.message}`, {
        bookingId: params.bookingId,
      });
      return;
    }
    if (!bumped || !(bumped as { id?: string }).id) {
      return;
    }
    didIncrement = true;

    if (process.env.AUTO_DISPATCH_CLEANERS === "false") return;

    const exclude = [params.rejectedCleanerId];

    const r = await ensureBookingAssignment(supabase, params.bookingId, {
      source: "offer_decline_redispatch",
      smartAssign: { excludeCleanerIds: exclude },
      metricSegmentationOverrides: { attempt_number: nextAttempts },
    });

    if (!r.ok) {
      await markBookingPaymentNeedsFollowUp({ admin: supabase, bookingId: params.bookingId });
      await reportOperationalIssue("warn", "redispatchAfterOfferReject", "Re-dispatch did not assign", {
        bookingId: params.bookingId,
        error: r.error,
        message: r.message ?? null,
      });
      return;
    }

    /**
     * Only `user_selected` declines convert to `auto_fallback` — that tag is meaningful only
     * for the "checkout chose this cleaner, but they declined and we fell back to auto" flow.
     * `auto_dispatch` bookings stay tagged auto_dispatch through redispatch waves.
     */
    if (isUserSelected) {
      const attempted =
        String((b as { selected_cleaner_id?: string | null }).selected_cleaner_id ?? "").trim() ||
        params.rejectedCleanerId;
      const { error: patchErr } = await tagUserSelectedRedispatchFallback({
        admin: supabase,
        bookingId: params.bookingId,
        reassignmentReason,
        attemptedCleanerId: attempted,
      });
      if (patchErr) {
        await reportOperationalIssue("warn", "redispatchAfterOfferReject", `fallback tag update: ${patchErr.message}`, {
          bookingId: params.bookingId,
        });
      }
    }
  } finally {
    if (didIncrement) {
      const baseBackoff = skipBackoff ? 0 : backoffMsAfterUserSelectedRecoveryWave(nextAttempts);
      const backoffMs = skipBackoff || baseBackoff <= 0 ? 0 : applyDispatchBackoffJitter(baseBackoff);
      const nextRecoveryIso =
        skipBackoff || backoffMs <= 0 ? null : new Date(Date.now() + backoffMs).toISOString();
      const { error: schedErr } = await scheduleRedispatchRecoveryBackoff({
        admin: supabase,
        bookingId: params.bookingId,
        nextRecoveryIso,
      });
      if (schedErr) {
        await reportOperationalIssue("warn", "redispatchAfterOfferReject", `schedule backoff: ${schedErr.message}`, {
          bookingId: params.bookingId,
        });
      }

      const waveTags = compactDispatchMetricTags({
        assignment_type: waveAssignmentType,
        fallback_reason: null,
        attempt_number: nextAttempts,
      });
      metrics.increment("dispatch.recovery.wave", {
        bookingId: params.bookingId,
        ...waveTags,
      });
    }
  }
}
