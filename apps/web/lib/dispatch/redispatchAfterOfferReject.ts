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

/**
 * When a cleaner declines (or last parallel offer closes) and the booking is still unassigned,
 * return dispatch to searching and run smart assign excluding the rejecting cleaner.
 * If the booking was `user_selected`, mark `auto_fallback` so ops/analytics reflect reassignment.
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

  try {
    const { data: b, error: bErr } = await supabase
      .from("bookings")
      .select("id, status, cleaner_id, dispatch_status, assignment_type, selected_cleaner_id, dispatch_attempt_count")
      .eq("id", params.bookingId)
      .maybeSingle();

    if (bErr || !b) return;
    const st = String((b as { status?: string }).status ?? "").toLowerCase();
    if (st !== "pending") return;
    if ((b as { cleaner_id?: string | null }).cleaner_id) return;

    const at = String((b as { assignment_type?: string | null }).assignment_type ?? "").toLowerCase();
    /** Parallel soft dispatch from the same server request handles declines; this path is checkout “chosen cleaner” only. */
    if (at !== "user_selected") return;

    waveAssignmentType = at;

    const attempts = Number((b as { dispatch_attempt_count?: number | null }).dispatch_attempt_count ?? 0) || 0;
    const maxA = maxDispatchAttempts();
    if (attempts >= maxA) {
      const { error: failErr } = await supabase
        .from("bookings")
        .update({ dispatch_status: "failed" })
        .eq("id", params.bookingId)
        .eq("status", "pending")
        .is("cleaner_id", null);
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
    const { data: bumped, error: bumpErr } = await supabase
      .from("bookings")
      .update({ dispatch_status: "searching", dispatch_attempt_count: nextAttempts })
      .eq("id", params.bookingId)
      .eq("status", "pending")
      .is("cleaner_id", null)
      .eq("assignment_type", "user_selected")
      .eq("dispatch_attempt_count", expected)
      .select("id")
      .maybeSingle();

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
      await reportOperationalIssue("warn", "redispatchAfterOfferReject", "Re-dispatch did not assign", {
        bookingId: params.bookingId,
        error: r.error,
        message: r.message ?? null,
      });
      return;
    }

    const attempted =
      String((b as { selected_cleaner_id?: string | null }).selected_cleaner_id ?? "").trim() ||
      params.rejectedCleanerId;
    const { error: patchErr } = await supabase
      .from("bookings")
      .update({
        assignment_type: "auto_fallback",
        fallback_reason: reassignmentReason,
        attempted_cleaner_id: attempted,
      })
      .eq("id", params.bookingId);
    if (patchErr) {
      await reportOperationalIssue("warn", "redispatchAfterOfferReject", `fallback tag update: ${patchErr.message}`, {
        bookingId: params.bookingId,
      });
    }
  } finally {
    if (didIncrement) {
      const baseBackoff = skipBackoff ? 0 : backoffMsAfterUserSelectedRecoveryWave(nextAttempts);
      const backoffMs = skipBackoff || baseBackoff <= 0 ? 0 : applyDispatchBackoffJitter(baseBackoff);
      const nextRecoveryIso =
        skipBackoff || backoffMs <= 0 ? null : new Date(Date.now() + backoffMs).toISOString();
      const { error: schedErr } = await supabase
        .from("bookings")
        .update({
          dispatch_next_recovery_at: nextRecoveryIso,
          dispatch_recovery_lease_until: null,
        })
        .eq("id", params.bookingId);
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
