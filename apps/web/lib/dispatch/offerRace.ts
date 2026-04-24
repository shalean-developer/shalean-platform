import type { SupabaseClient } from "@supabase/supabase-js";
import { createDispatchOfferRow } from "@/lib/dispatch/dispatchOffers";
import type { SmartDispatchCandidate } from "@/lib/dispatch/types";
import { logSystemEvent } from "@/lib/logging/systemLog";

const POLL_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type OfferRaceWinner = {
  cleanerId: string;
  offerId: string;
  score: number;
  distance_km: number;
};

/**
 * Parallel offers: first acceptance wins; losers expired via DB RPC on accept path.
 * Polls booking + offer rows until timeout or resolution.
 */
export async function runParallelDispatchOfferRace(params: {
  supabase: SupabaseClient;
  bookingId: string;
  batch: SmartDispatchCandidate[];
  parallelCount: number;
  offerTimeoutMs: number;
  ttlSeconds: number;
  /** Base rank offset for dispatch_offers.rank_index */
  rankOffset: number;
  /** Matches `bookings.dispatch_attempt_count` for this dispatch wave (metric alignment). */
  metricAttemptNumber?: number;
}): Promise<OfferRaceWinner | null> {
  const { supabase, bookingId, offerTimeoutMs, ttlSeconds, rankOffset } = params;
  const parallelCount = Math.max(1, Math.min(3, params.parallelCount));
  const slice = params.batch.slice(0, parallelCount);

  const tStart = Date.now();
  const created = await Promise.all(
    slice.map((c, i) =>
      createDispatchOfferRow({
        supabase,
        bookingId,
        cleanerId: c.id,
        rankIndex: rankOffset + i,
        ttlSeconds,
        metricAttemptNumber: params.metricAttemptNumber,
      }),
    ),
  );

  const joined: Array<{ c: SmartDispatchCandidate; offerId: string }> = [];
  for (let i = 0; i < slice.length; i++) {
    const row = created[i];
    if (row?.ok) joined.push({ c: slice[i]!, offerId: row.offerId });
    else if (row && !row.ok && process.env.NODE_ENV !== "production") {
      console.warn("[offerRace] createDispatchOfferRow failed", { bookingId, error: row.error });
    }
  }

  if (joined.length === 0) return null;

  await logSystemEvent({
    level: "info",
    source: "dispatch_race_started",
    message: "Parallel dispatch race started",
    context: {
      bookingId,
      candidate_count: params.batch.length,
      parallel_count: joined.length,
      offer_ids: joined.map((j) => j.offerId),
    },
  });

  const deadline = Date.now() + offerTimeoutMs;

  while (Date.now() < deadline) {
    const { data: booking } = await supabase
      .from("bookings")
      .select("cleaner_id, status")
      .eq("id", bookingId)
      .maybeSingle();

    const b = booking as { cleaner_id?: string | null; status?: string | null } | null;
    if (b && String(b.status ?? "").toLowerCase() === "assigned" && b.cleaner_id) {
      const wid = String(b.cleaner_id);
      const hit = joined.find((j) => j.c.id === wid);
      if (hit) {
        await logSystemEvent({
          level: "info",
          source: "dispatch_race_winner",
          message: "Dispatch race winner",
          context: {
            bookingId,
            cleanerId: wid,
            offerId: hit.offerId,
            parallel_count: joined.length,
            latency_ms: Date.now() - tStart,
            loser_count: joined.length - 1,
          },
        });
        if (joined.length > 1) {
          await logSystemEvent({
            level: "info",
            source: "dispatch_race_cancelled",
            message: "Peer offers superseded by winner",
            context: {
              bookingId,
              winner_offer_id: hit.offerId,
              loser_count: joined.length - 1,
            },
          });
        }
        return {
          cleanerId: wid,
          offerId: hit.offerId,
          score: hit.c.score,
          distance_km: hit.c.distance_km,
        };
      }
      const nowIso = new Date().toISOString();
      for (const j of joined) {
        await supabase
          .from("dispatch_offers")
          .update({ status: "expired", responded_at: nowIso })
          .eq("id", j.offerId)
          .eq("status", "pending");
      }
      await logSystemEvent({
        level: "info",
        source: "dispatch_race_cancelled",
        message: "Booking assigned outside race batch",
        context: { bookingId, assigned_cleaner_id: wid, parallel_count: joined.length },
      });
      return null;
    }

    const { data: offs } = await supabase
      .from("dispatch_offers")
      .select("id, status")
      .in(
        "id",
        joined.map((j) => j.offerId),
      );

    const pending = (offs ?? []).filter((o) => String((o as { status?: string }).status ?? "") === "pending");
    if (pending.length === 0) {
      await logSystemEvent({
        level: "info",
        source: "dispatch_race_cancelled",
        message: "All offers closed without assignment",
        context: { bookingId, parallel_count: joined.length, latency_ms: Date.now() - tStart },
      });
      return null;
    }

    await sleep(POLL_MS);
  }

  const nowIso = new Date().toISOString();
  for (const j of joined) {
    await supabase
      .from("dispatch_offers")
      .update({ status: "expired", responded_at: nowIso })
      .eq("id", j.offerId)
      .eq("status", "pending");
  }

  await logSystemEvent({
    level: "info",
    source: "dispatch_race_cancelled",
    message: "Dispatch race timed out",
    context: {
      bookingId,
      parallel_count: joined.length,
      latency_ms: Date.now() - tStart,
    },
  });

  return null;
}
