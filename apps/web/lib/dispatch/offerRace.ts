import type { SupabaseClient } from "@supabase/supabase-js";
import { createDispatchOfferRow } from "@/lib/dispatch/dispatchOffers";
import { MAX_PARALLEL_OFFERS_PEAK } from "@/lib/dispatch/dispatchConstants";
import type { DispatchTierWindowPlan } from "@/lib/dispatch/planDispatchTierWindows";
import type { SmartDispatchCandidate } from "@/lib/dispatch/types";
import { logSystemEvent } from "@/lib/logging/systemLog";

const POLL_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function envMs(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 5_000 ? n : fallback;
}

/** Delivered but no read after this → expire offer (Phase 8E). */
const ESC_DELIVERED_NO_READ_MS = () => envMs("DISPATCH_ESCALATE_DELIVERED_NO_READ_MS", 120_000);
/** Read but still pending (no reply) after this → expire offer. */
const ESC_READ_NO_REPLY_MS = () => envMs("DISPATCH_ESCALATE_READ_NO_REPLY_MS", 240_000);
export type OfferRaceWinner = {
  cleanerId: string;
  offerId: string;
  score: number;
  distance_km: number;
  /** Set when the winning row was created under tiered smart dispatch. */
  dispatch_tier?: string | null;
};

type OfferWatchRow = {
  id: string;
  status?: string | null;
  first_read_at?: string | null;
  first_delivered_at?: string | null;
  expires_at?: string | null;
};

async function maybeEscalateStalePendingOffers(params: {
  supabase: SupabaseClient;
  offerIds: string[];
  nowMs: number;
}): Promise<void> {
  if (!params.offerIds.length) return;
  const { data, error } = await params.supabase
    .from("dispatch_offers")
    .select("id, status, first_read_at, first_delivered_at, expires_at")
    .in("id", params.offerIds)
    .eq("status", "pending");

  if (error || !data?.length) return;

  const nowIso = new Date(params.nowMs).toISOString();
  const dDeliveredNoRead = ESC_DELIVERED_NO_READ_MS();
  const dReadNoReply = ESC_READ_NO_REPLY_MS();

  for (const raw of data as OfferWatchRow[]) {
    const id = String(raw.id ?? "");
    if (!id) continue;

    const expMs = raw.expires_at ? new Date(raw.expires_at).getTime() : NaN;
    if (Number.isFinite(expMs) && params.nowMs > expMs) continue;

    const fd = raw.first_delivered_at ? new Date(raw.first_delivered_at).getTime() : NaN;
    const fr = raw.first_read_at ? new Date(raw.first_read_at).getTime() : NaN;

    let shouldExpire = false;

    if (Number.isFinite(fd) && !Number.isFinite(fr) && params.nowMs - fd >= dDeliveredNoRead) {
      shouldExpire = true;
    } else if (Number.isFinite(fr) && params.nowMs - fr >= dReadNoReply) {
      shouldExpire = true;
    }

    if (!shouldExpire) continue;

    const { error: upErr } = await params.supabase
      .from("dispatch_offers")
      .update({ status: "expired", responded_at: nowIso })
      .eq("id", id)
      .eq("status", "pending");

    if (!upErr) {
      await logSystemEvent({
        level: "info",
        source: "dispatch_offer_escalated",
        message: "Expired pending dispatch offer (read/delivery escalation)",
        context: { offerId: id },
      });
    }
  }
}

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
  const parallelCount = Math.max(1, Math.min(MAX_PARALLEL_OFFERS_PEAK, params.parallelCount));
  const slice = params.batch.slice(0, parallelCount);

  const tStart = Date.now();
  /** Spread row creation + per-offer WhatsApp over ~1–2s to avoid Meta/DB bursts (Phase 8F). */
  const spreadMsRaw = process.env.DISPATCH_OFFER_CREATE_SPREAD_MS?.trim();
  const spreadMs = (() => {
    const n = spreadMsRaw ? Number(spreadMsRaw) : 1500;
    return Math.min(2000, Math.max(600, Number.isFinite(n) ? n : 1500));
  })();
  const gapCount = Math.max(0, slice.length - 1);
  const gapMs = gapCount > 0 ? Math.max(80, Math.floor(spreadMs / gapCount)) : 0;
  const created: Awaited<ReturnType<typeof createDispatchOfferRow>>[] = [];
  for (let i = 0; i < slice.length; i++) {
    if (i > 0 && gapMs > 0) await sleep(gapMs);
    const row = await createDispatchOfferRow({
      supabase,
      bookingId,
      cleanerId: slice[i]!.id,
      rankIndex: rankOffset + i,
      ttlSeconds,
      metricAttemptNumber: params.metricAttemptNumber,
    });
    created.push(row);
  }

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

    await maybeEscalateStalePendingOffers({
      supabase,
      offerIds: joined.map((j) => j.offerId),
      nowMs: Date.now(),
    });

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

/**
 * Tiered smart dispatch: create one pending offer per planned cleaner (staggered `dispatch_visible_at`),
 * poll until the booking assigns or the extended deadline (last visibility + TTL + buffer).
 */
export async function runTieredParallelDispatchOfferRace(params: {
  supabase: SupabaseClient;
  bookingId: string;
  plans: Array<{ candidate: SmartDispatchCandidate; plan: DispatchTierWindowPlan }>;
  offerTimeoutMs: number;
  ttlSeconds: number;
  metricAttemptNumber?: number;
}): Promise<OfferRaceWinner | null> {
  const { supabase, bookingId, ttlSeconds } = params;
  if (!params.plans.length) return null;

  const tStart = Date.now();
  const spreadMsRaw = process.env.DISPATCH_OFFER_CREATE_SPREAD_MS?.trim();
  const spreadMs = (() => {
    const n = spreadMsRaw ? Number(spreadMsRaw) : 1500;
    return Math.min(2000, Math.max(600, Number.isFinite(n) ? n : 1500));
  })();
  const gapCount = Math.max(0, params.plans.length - 1);
  const gapMs = gapCount > 0 ? Math.max(80, Math.floor(spreadMs / gapCount)) : 0;

  const ordered = [...params.plans].sort((a, b) => a.plan.rankIndex - b.plan.rankIndex);
  const created: Awaited<ReturnType<typeof createDispatchOfferRow>>[] = [];
  for (let i = 0; i < ordered.length; i++) {
    if (i > 0 && gapMs > 0) await sleep(gapMs);
    const { candidate, plan } = ordered[i]!;
    const row = await createDispatchOfferRow({
      supabase,
      bookingId,
      cleanerId: candidate.id,
      rankIndex: plan.rankIndex,
      ttlSeconds,
      metricAttemptNumber: params.metricAttemptNumber,
      dispatchTier: plan.tier,
      dispatchVisibleAtIso: plan.dispatchVisibleAtIso,
      dispatchTierWindowEndAtIso: plan.dispatchTierWindowEndAtIso,
    });
    created.push(row);
  }

  const joined: Array<{ c: SmartDispatchCandidate; offerId: string; tier: string }> = [];
  for (let i = 0; i < ordered.length; i++) {
    const row = created[i];
    const { candidate, plan } = ordered[i]!;
    if (row?.ok) joined.push({ c: candidate, offerId: row.offerId, tier: plan.tier });
    else if (row && !row.ok && process.env.NODE_ENV !== "production") {
      console.warn("[offerRace] tiered createDispatchOfferRow failed", { bookingId, error: row.error });
    }
  }

  if (joined.length === 0) return null;

  const nowMs = Date.now();
  const lastVisibleMs = Math.max(
    ...ordered.map((p) => new Date(p.plan.dispatchVisibleAtIso).getTime()),
  );
  const tierExtraMs = Math.max(0, lastVisibleMs - nowMs) + ttlSeconds * 1000 + 15_000;
  const deadline = nowMs + Math.max(params.offerTimeoutMs, tierExtraMs);

  const tierACount = ordered.filter((p) => p.plan.tier === "A").length;
  const tierBCount = ordered.filter((p) => p.plan.tier === "B").length;
  const tierCCount = ordered.filter((p) => p.plan.tier === "C").length;

  await logSystemEvent({
    level: "info",
    source: "dispatch_race_started",
    message: "Tiered parallel dispatch race started",
    context: {
      bookingId,
      candidate_count: ordered.length,
      parallel_count: joined.length,
      offer_ids: joined.map((j) => j.offerId),
      tiered: true,
      tier_a_count: tierACount,
      tier_b_count: tierBCount,
      tier_c_count: tierCCount,
    },
  });

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
            tiered: true,
            dispatch_tier: hit.tier,
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
              tiered: true,
            },
          });
        }
        return {
          cleanerId: wid,
          offerId: hit.offerId,
          score: hit.c.score,
          distance_km: hit.c.distance_km,
          dispatch_tier: hit.tier,
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
        context: { bookingId, assigned_cleaner_id: wid, parallel_count: joined.length, tiered: true },
      });
      return null;
    }

    await maybeEscalateStalePendingOffers({
      supabase,
      offerIds: joined.map((j) => j.offerId),
      nowMs: Date.now(),
    });

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
        context: { bookingId, parallel_count: joined.length, latency_ms: Date.now() - tStart, tiered: true },
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
      tiered: true,
    },
  });

  return null;
}
