import "server-only";

import { isBookingIdUuidLike } from "@/lib/cleaner/bookingIdUuidLike";
import { parseClaimBookingEarningsRecomputeRpc } from "@/lib/cleaner/parseClaimBookingEarningsRecomputeRpc";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { metrics } from "@/lib/metrics/counters";
import { persistCleanerPayoutIfUnset } from "@/lib/payout/persistCleanerPayout";
import type { SupabaseClient } from "@supabase/supabase-js";

const COOLDOWN_SECONDS = 120;

export type StuckEarningsRecomputeSource =
  | "jobs_list"
  | "job_detail"
  | "admin_patch_already_completed_persist_failed"
  | "admin_patch_already_completed_persist_threw"
  | "admin_patch_final_integrity"
  | "admin_booking_roster_replace"
  | "admin_booking_roster_emergency_put";

type SkippedReason =
  | "cooldown"
  | "missing_booking"
  | "deleted_booking"
  | "deleted_booking_after_prefetch";

function emitSkippedMetric(
  reason: SkippedReason,
  fields: { next_allowed_at_utc?: string },
  recompute_source: StuckEarningsRecomputeSource,
): void {
  metrics.increment("payout.stuck_earnings_recompute_skipped_cooldown", {
    reason,
    recompute_source,
    ...fields,
  });
}

/**
 * Best-effort recompute when earnings stay null after assignment.
 * Uses DB `claim_booking_earnings_recompute` so cooldown is shared across instances.
 */
export function scheduleStuckEarningsRecomputeDebounced(params: {
  admin: SupabaseClient;
  bookingId: string;
  cleanerId: string;
  /** Where the stuck-null check ran (metrics + log correlation). */
  recomputeSource?: StuckEarningsRecomputeSource;
}): void {
  void (async () => {
    const { bookingId, cleanerId, admin } = params;
    const recompute_source = params.recomputeSource ?? "jobs_list";

    if (!isBookingIdUuidLike(bookingId)) {
      void logSystemEvent({
        level: "warn",
        source: "cleaner_jobs_api",
        message: "earnings_recompute_skipped_invalid_booking_id",
        context: { booking_id: bookingId, cleaner_id: cleanerId, recompute_source },
      });
      emitSkippedMetric("missing_booking", {}, recompute_source);
      return;
    }

    const { data: existsRow, error: existsErr } = await admin.from("bookings").select("id").eq("id", bookingId).maybeSingle();
    if (existsErr) {
      void logSystemEvent({
        level: "warn",
        source: "cleaner_jobs_api",
        message: "earnings_recompute_prefetch_booking_failed",
        context: { booking_id: bookingId, cleaner_id: cleanerId, error: existsErr.message, recompute_source },
      });
      emitSkippedMetric("missing_booking", {}, recompute_source);
      return;
    }
    if (!existsRow) {
      void logSystemEvent({
        level: "info",
        source: "cleaner_jobs_api",
        message: "earnings_recompute_skipped_deleted_booking",
        context: { booking_id: bookingId, cleaner_id: cleanerId, recompute_source },
      });
      emitSkippedMetric("deleted_booking", {}, recompute_source);
      return;
    }

    const { data, error: claimErr } = await admin.rpc("claim_booking_earnings_recompute", {
      p_booking_id: bookingId,
      p_cooldown_seconds: COOLDOWN_SECONDS,
    });
    if (claimErr) {
      void logSystemEvent({
        level: "warn",
        source: "cleaner_jobs_api",
        message: "earnings_recompute_claim_rpc_failed",
        context: {
          booking_id: bookingId,
          cleaner_id: cleanerId,
          error: claimErr.message,
          recompute_source,
        },
      });
      return;
    }

    const claim = parseClaimBookingEarningsRecomputeRpc(data);
    if (!claim) {
      void logSystemEvent({
        level: "warn",
        source: "cleaner_jobs_api",
        message: "earnings_recompute_claim_rpc_unexpected_shape",
        context: { booking_id: bookingId, cleaner_id: cleanerId, recompute_source },
      });
      emitSkippedMetric("missing_booking", {}, recompute_source);
      return;
    }

    if (!claim.claimed) {
      const naRaw = claim.next_allowed_at;
      const na = typeof naRaw === "string" ? naRaw.trim() : "";
      const hasWindow = na.length > 0;
      if (hasWindow) {
        emitSkippedMetric("cooldown", { next_allowed_at_utc: na }, recompute_source);
        return;
      }
      void logSystemEvent({
        level: "warn",
        source: "cleaner_jobs_api",
        message: "earnings_recompute_claim_row_missing_after_prefetch",
        context: { booking_id: bookingId, cleaner_id: cleanerId, recompute_source },
      });
      emitSkippedMetric("deleted_booking_after_prefetch", {}, recompute_source);
      return;
    }

    metrics.increment("payout.stuck_earnings_triggered", { recompute_source });

    try {
      const r = await persistCleanerPayoutIfUnset(params);
      if (!r.ok) {
        void logSystemEvent({
          level: "warn",
          source: "cleaner_jobs_api",
          message: "earnings_stuck_null_recompute_failed",
          context: {
            booking_id: bookingId,
            cleaner_id: cleanerId,
            error: r.error,
            recompute_source,
          },
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      void logSystemEvent({
        level: "warn",
        source: "cleaner_jobs_api",
        message: "earnings_stuck_null_recompute_threw",
        context: { booking_id: bookingId, cleaner_id: cleanerId, error: msg, recompute_source },
      });
    }
  })();
}
