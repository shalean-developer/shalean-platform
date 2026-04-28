import type { SupabaseClient } from "@supabase/supabase-js";
import { maxDispatchOffersPerBooking } from "@/lib/dispatch/dispatchAttemptLimits";
import { processDeferredDispatchOfferNotifications } from "@/lib/dispatch/dispatchOffers";
import { notifyDispatchEscalationAdmin } from "@/lib/dispatch/dispatchEscalation";
import { enqueueDispatchRetry, enqueueStrandedBookings } from "@/lib/dispatch/dispatchRetryQueue";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { metrics } from "@/lib/metrics/counters";

const MAX_EXPIRED_BATCH = 200;

export type RunDispatchTimeoutsResult = {
  scanned: number;
  expired: number;
  reassignmentQueued: number;
  offerCapHits: number;
  errors: number;
  /** Bookings re-injected via `enqueueStrandedBookings` (parity with SQL `enqueue_stranded_pending_bookings`). */
  strandedEnqueued: number;
};

/** Jittered 30–60s before reassignment after TTL expiry (reduces back-to-back cleaner pings). */
function resolveExpiredOfferReassignDelaySeconds(): number {
  const raw = process.env.DISPATCH_EXPIRED_REASSIGN_DELAY_SECONDS?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0 && n <= 300) {
      return Math.round(n);
    }
  }
  return 30 + Math.floor(Math.random() * 31);
}

/**
 * Expires stale pending `dispatch_offers`, caps total offers per booking, and queues reassignment
 * after a short delay (parallel race safe; exclude timed-out cleaner via retry queue metadata).
 */
export async function runDispatchTimeouts(supabase: SupabaseClient): Promise<RunDispatchTimeoutsResult> {
  const out: RunDispatchTimeoutsResult = {
    scanned: 0,
    expired: 0,
    reassignmentQueued: 0,
    offerCapHits: 0,
    errors: 0,
    strandedEnqueued: 0,
  };

  try {
    await processDeferredDispatchOfferNotifications(supabase);
  } catch (e) {
    out.errors++;
    const msg = e instanceof Error ? e.message : String(e);
    await logSystemEvent({
      level: "warn",
      source: "runDispatchTimeouts",
      message: msg,
      context: { step: "deferred_dispatch_notifications" },
    });
  }

  const runStrandedPass = async () => {
    try {
      out.strandedEnqueued = await enqueueStrandedBookings(supabase);
    } catch (e) {
      out.errors++;
      const msg = e instanceof Error ? e.message : String(e);
      await logSystemEvent({
        level: "error",
        source: "runDispatchTimeouts",
        message: msg,
        context: { step: "enqueue_stranded" },
      });
    }
  };

  const { data: expiredOffers, error } = await supabase
    .from("dispatch_offers")
    .select("id, booking_id, cleaner_id")
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: true })
    .limit(MAX_EXPIRED_BATCH);

  if (error) {
    out.errors++;
    await logSystemEvent({
      level: "error",
      source: "runDispatchTimeouts",
      message: error.message,
      context: { step: "select_expired" },
    });
    await runStrandedPass();
    return out;
  }

  const rows = expiredOffers ?? [];
  out.scanned = rows.length;

  for (const offer of rows) {
    try {
      const offerId = typeof offer.id === "string" ? offer.id : "";
      const bookingId = typeof offer.booking_id === "string" ? offer.booking_id : "";
      const cleanerId = typeof offer.cleaner_id === "string" ? offer.cleaner_id : "";
      if (!offerId || !bookingId) continue;

      const respondedAt = new Date().toISOString();
      const { data: updated, error: upErr } = await supabase
        .from("dispatch_offers")
        .update({ status: "expired", responded_at: respondedAt })
        .eq("id", offerId)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();

      if (upErr) {
        out.errors++;
        await logSystemEvent({
          level: "warn",
          source: "runDispatchTimeouts",
          message: upErr.message,
          context: { offerId, bookingId, step: "expire_update" },
        });
        continue;
      }

      if (!updated || !(updated as { id?: string }).id) {
        continue;
      }

      out.expired++;

      await logSystemEvent({
        level: "info",
        source: "dispatch_offer_expired",
        message: "dispatch_offer_expired",
        context: { offerId, bookingId },
      });

      const { data: booking, error: bErr } = await supabase
        .from("bookings")
        .select("cleaner_id")
        .eq("id", bookingId)
        .maybeSingle();

      if (bErr) {
        out.errors++;
        await logSystemEvent({
          level: "warn",
          source: "runDispatchTimeouts",
          message: bErr.message,
          context: { offerId, bookingId, step: "select_booking" },
        });
        continue;
      }

      if (!booking) continue;

      if ((booking as { cleaner_id?: string | null }).cleaner_id) {
        continue;
      }

      const { count: pendingSiblings, error: cErr } = await supabase
        .from("dispatch_offers")
        .select("id", { count: "exact", head: true })
        .eq("booking_id", bookingId)
        .eq("status", "pending");

      if (cErr) {
        out.errors++;
        await logSystemEvent({
          level: "warn",
          source: "runDispatchTimeouts",
          message: cErr.message,
          context: { offerId, bookingId, step: "count_pending_offers" },
        });
        continue;
      }

      if ((pendingSiblings ?? 0) > 0) {
        continue;
      }

      if (process.env.AUTO_DISPATCH_CLEANERS === "false") {
        continue;
      }

      const { count: offerCount, error: ocErr } = await supabase
        .from("dispatch_offers")
        .select("*", { count: "exact", head: true })
        .eq("booking_id", bookingId);

      if (ocErr) {
        out.errors++;
        await logSystemEvent({
          level: "warn",
          source: "runDispatchTimeouts",
          message: ocErr.message,
          context: { offerId, bookingId, step: "count_offers_cap" },
        });
        continue;
      }

      const offerCap = maxDispatchOffersPerBooking();
      const totalOffers = offerCount ?? 0;
      if (totalOffers > offerCap) {
        out.offerCapHits++;
        const { error: capErr } = await supabase
          .from("bookings")
          .update({ dispatch_status: "unassignable" })
          .eq("id", bookingId)
          .eq("status", "pending")
          .is("cleaner_id", null);

        if (capErr) {
          out.errors++;
          await logSystemEvent({
            level: "warn",
            source: "runDispatchTimeouts",
            message: capErr.message,
            context: { offerId, bookingId, step: "offer_cap_update_booking" },
          });
        }

        metrics.increment("dispatch.offer_cap_exceeded", { bookingId, totalOffers, offerCap });

        await notifyDispatchEscalationAdmin({
          bookingId,
          retriesDone: totalOffers,
          lastReason: `dispatch_offer_cap_exceeded_${totalOffers}_gt_${offerCap}`,
          phase: "terminal_unassignable",
        });

        await logSystemEvent({
          level: "warn",
          source: "dispatch_offer_cap",
          message: "Stopped auto dispatch: offer count exceeded cap",
          context: { bookingId, offerId, totalOffers, offerCap, dispatch_status: "unassignable" },
        });
        continue;
      }

      const delaySec = resolveExpiredOfferReassignDelaySeconds();
      const queued = await enqueueDispatchRetry(supabase, bookingId, "dispatch_offer_expired", {
        firstDelaySeconds: delaySec,
        excludeCleanerId: cleanerId || undefined,
      });
      if (queued) {
        out.reassignmentQueued++;
      }
    } catch (e) {
      out.errors++;
      const msg = e instanceof Error ? e.message : String(e);
      await logSystemEvent({
        level: "error",
        source: "runDispatchTimeouts",
        message: msg,
        context: {
          offerId: typeof offer.id === "string" ? offer.id : null,
          bookingId: typeof offer.booking_id === "string" ? offer.booking_id : null,
        },
      });
    }
  }

  await runStrandedPass();
  return out;
}
