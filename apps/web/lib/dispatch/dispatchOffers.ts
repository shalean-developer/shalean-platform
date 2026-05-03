import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { syncCleanerBusyFromBookings } from "@/lib/cleaner/syncCleanerStatus";
import {
  notifyCleanerDispatchOfferLostRaceSms,
  notifyCleanerOfDispatchOffer,
  notifyCleanerOfferDeclined,
} from "@/lib/dispatch/offerNotifications";
import { tryEmitDispatchOfferTimeoutMetric } from "@/lib/dispatch/offerTimeoutMetric";
import {
  compactDispatchMetricTags,
  firstOfferMetricAnchorIso,
  loadDispatchMetricSegmentation,
} from "@/lib/dispatch/dispatchMetricContext";
import { assignCleanerUxVariantForCleaner, sanitizeCleanerUxVariant } from "@/lib/cleaner/cleanerOfferUxVariant";
import { learnFromCleanerAcceptance } from "@/lib/ai-autonomy/learningLoop";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { metrics } from "@/lib/metrics/counters";
import { notifyCleanerAssignedBooking } from "@/lib/dispatch/notifyCleanerAssigned";
import { maybeRedispatchPendingBookingIfOffersExhausted } from "@/lib/dispatch/redispatchAfterOfferReject";
import { marketplaceBookingPatchOnAssign } from "@/lib/marketplace-intelligence/marketplaceBookingMeta";
import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";

const POLL_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type CreateDispatchOfferRowResult =
  | { ok: true; offerId: string; expiresAtIso: string }
  | { ok: false; error: string };

export async function createDispatchOfferRow(params: {
  supabase: SupabaseClient;
  bookingId: string;
  cleanerId: string;
  rankIndex: number;
  ttlSeconds: number;
  /** Dispatch wave number for metrics (same row as `dispatch_attempt_count` after bump). */
  metricAttemptNumber?: number;
  /** Smart dispatch tier (A/B/C); null = legacy row. */
  dispatchTier?: "A" | "B" | "C" | null;
  /** When set, cleaner APIs hide the offer until this instant; `expires_at` runs from this anchor. */
  dispatchVisibleAtIso?: string | null;
  /** End of exclusive window for this wave (logging / analytics). */
  dispatchTierWindowEndAtIso?: string | null;
  /** Dispatch v2: shared wave id for parallel offers. */
  batchId?: string | null;
  /** Dispatch v2: composite ranking score persisted on the row. */
  priorityScore?: number | null;
  /** Dispatch v2: order within batch (defaults to `rankIndex`). */
  sentRank?: number | null;
  /** Dispatch v2: attempt / wave number (defaults from `metricAttemptNumber` when set). */
  attempts?: number | null;
  /**
   * When true, skip immediate SMS for this offer (cleaner still sees in-app + realtime).
   * Used to cap outbound cost while parallel offers exist.
   */
  skipImmediateNotification?: boolean;
}): Promise<CreateDispatchOfferRowResult> {
  const { data: bookingHead, error: headErr } = await params.supabase
    .from("bookings")
    .select("status")
    .eq("id", params.bookingId)
    .maybeSingle();
  if (headErr) {
    return { ok: false, error: headErr.message };
  }
  const headSt = String((bookingHead as { status?: string | null } | null)?.status ?? "").toLowerCase();
  if (headSt === "pending_payment" || headSt === "payment_expired") {
    return { ok: false, error: "Payment not completed — cannot send dispatch offer." };
  }

  const { count: priorOfferCount, error: priorCountErr } = await params.supabase
    .from("dispatch_offers")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", params.bookingId);

  if (priorCountErr && process.env.NODE_ENV !== "production") {
    console.warn("[createDispatchOfferRow] prior offer count failed", priorCountErr.message);
  }

  const visibleAtMs = params.dispatchVisibleAtIso ? new Date(params.dispatchVisibleAtIso).getTime() : Date.now();
  const anchorMs = Number.isFinite(visibleAtMs) ? visibleAtMs : Date.now();
  const expiresAt = new Date(anchorMs + params.ttlSeconds * 1000).toISOString();
  const nowMs = Date.now();
  const deferNotify = anchorMs > nowMs + 2500;
  const ux_variant = assignCleanerUxVariantForCleaner(params.cleanerId);
  const offer_token = randomUUID();
  const attempts =
    typeof params.attempts === "number" && Number.isFinite(params.attempts)
      ? Math.max(0, Math.floor(params.attempts))
      : typeof params.metricAttemptNumber === "number" && Number.isFinite(params.metricAttemptNumber)
        ? Math.max(0, Math.floor(params.metricAttemptNumber))
        : 0;
  const sentRank =
    typeof params.sentRank === "number" && Number.isFinite(params.sentRank)
      ? Math.floor(params.sentRank)
      : params.rankIndex;
  const priorityScore =
    typeof params.priorityScore === "number" && Number.isFinite(params.priorityScore)
      ? params.priorityScore
      : 0;

  const insertRow: Record<string, unknown> = {
    booking_id: params.bookingId,
    cleaner_id: params.cleanerId,
    status: "pending",
    rank_index: params.rankIndex,
    expires_at: expiresAt,
    ux_variant,
    offer_token,
    dispatch_tier: params.dispatchTier ?? null,
    dispatch_visible_at: params.dispatchVisibleAtIso ?? null,
    dispatch_tier_window_end_at: params.dispatchTierWindowEndAtIso ?? null,
    offer_notification_deferred: deferNotify,
    attempts,
    sent_rank: sentRank,
    priority_score: priorityScore,
  };
  if (params.batchId && typeof params.batchId === "string" && params.batchId.trim()) {
    insertRow.batch_id = params.batchId.trim();
  }

  const { data, error } = await params.supabase.from("dispatch_offers").insert(insertRow).select("id").single();

  if (error || !data?.id) {
    const msg = error?.message ?? "Insert dispatch_offers failed.";
    if (process.env.NODE_ENV !== "production") {
      console.error("[createDispatchOfferRow] insert failed", {
        bookingId: params.bookingId,
        cleanerId: params.cleanerId,
        message: msg,
        details: error,
      });
    }
    await logSystemEvent({
      level: "warn",
      source: "dispatch_offer_insert",
      message: msg,
      context: { bookingId: params.bookingId, cleanerId: params.cleanerId },
    });
    return { ok: false, error: msg };
  }

  const offerId = String(data.id);
  const { error: rpcErr } = await params.supabase.rpc("dispatch_cleaner_offer_sent", {
    p_cleaner_id: params.cleanerId,
  });
  if (rpcErr) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[createDispatchOfferRow] dispatch_cleaner_offer_sent failed (offer kept)", {
        bookingId: params.bookingId,
        cleanerId: params.cleanerId,
        offerId,
        message: rpcErr.message,
      });
    }
    await logSystemEvent({
      level: "warn",
      source: "dispatch_offer_sent_rpc",
      message: rpcErr.message,
      context: { bookingId: params.bookingId, cleanerId: params.cleanerId, offerId },
    });
  }

  const t0 = Date.now();
  await logSystemEvent({
    level: "info",
    source: "dispatch_offer_created",
    message: "Dispatch offer created",
    context: {
      bookingId: params.bookingId,
      cleanerId: params.cleanerId,
      offerId,
      rankIndex: params.rankIndex,
      latency_ms: Date.now() - t0,
      dispatch_tier: params.dispatchTier ?? null,
      dispatch_visible_at: params.dispatchVisibleAtIso ?? null,
      offer_notification_deferred: deferNotify,
    },
  });

  const seg = await loadDispatchMetricSegmentation(params.supabase, params.bookingId, {
    includePendingAnchors: true,
  });
  const segFields = {
    assignment_type: seg.assignment_type,
    fallback_reason: seg.fallback_reason,
    attempt_number:
      typeof params.metricAttemptNumber === "number" && Number.isFinite(params.metricAttemptNumber)
        ? Math.max(0, Math.floor(params.metricAttemptNumber))
        : seg.attempt_number,
    location: seg.location,
    offer_cohort_tags: true as const,
  };
  const metricTags = compactDispatchMetricTags(segFields);

  metrics.increment("dispatch.offer.created", {
    bookingId: params.bookingId,
    cleanerId: params.cleanerId,
    offerId,
    rankIndex: params.rankIndex,
    ux_variant,
    ...metricTags,
  });

  const prior = priorCountErr ? null : (priorOfferCount ?? 0);
  if (prior === 0) {
    const anchorIso = firstOfferMetricAnchorIso(seg);
    if (anchorIso) {
      const { data: kpiClaim } = await params.supabase
        .from("bookings")
        .update({ first_offer_kpi_logged_at: new Date().toISOString() })
        .eq("id", params.bookingId)
        .is("first_offer_kpi_logged_at", null)
        .select("id")
        .maybeSingle();
      if ((kpiClaim as { id?: string } | null)?.id) {
        const ms = Math.max(0, Date.now() - new Date(anchorIso).getTime());
        metrics.increment("dispatch.kpi.time_to_first_offer_ms", {
          bookingId: params.bookingId,
          offerId,
          ms,
          ...metricTags,
        });
      }
    }
  }

  try {
    if (!deferNotify && params.skipImmediateNotification !== true) {
      await notifyCleanerOfDispatchOffer({
        bookingId: params.bookingId,
        offerId,
        cleanerId: params.cleanerId,
        expiresAtIso: expiresAt,
        offerToken: offer_token,
      });
    }
  } catch (err) {
    console.error("[Dispatch Offer SMS Error]", err);
    await logSystemEvent({
      level: "error",
      source: "dispatch_offer_sms_notify",
      message: err instanceof Error ? err.message : String(err),
      context: { bookingId: params.bookingId, cleanerId: params.cleanerId, offerId },
    });
  }

  await params.supabase
    .from("bookings")
    .update({ dispatch_status: "offered" })
    .eq("id", params.bookingId);

  return { ok: true, offerId, expiresAtIso: expiresAt };
}

export type OfferPollResult = "assigned" | "rejected" | "expired";

export async function waitForDispatchOfferResolution(params: {
  supabase: SupabaseClient;
  offerId: string;
  bookingId: string;
  cleanerId: string;
  deadlineMs: number;
}): Promise<OfferPollResult> {
  const deadline = Date.now() + params.deadlineMs;
  const t0 = Date.now();

  while (Date.now() < deadline) {
    const [{ data: offer }, { data: booking }] = await Promise.all([
      params.supabase.from("dispatch_offers").select("status").eq("id", params.offerId).maybeSingle(),
      params.supabase.from("bookings").select("cleaner_id, status").eq("id", params.bookingId).maybeSingle(),
    ]);

    const ost = String((offer as { status?: string } | null)?.status ?? "");
    if (ost === "rejected") {
      await logSystemEvent({
        level: "info",
        source: "dispatch_offer_rejected",
        message: "Offer rejected (poll)",
        context: {
          bookingId: params.bookingId,
          offerId: params.offerId,
          cleanerId: params.cleanerId,
          latency_ms: Date.now() - t0,
        },
      });
      return "rejected";
    }

    const b = booking as { cleaner_id?: string | null; status?: string | null } | null;
    if (
      b &&
      String(b.status ?? "").toLowerCase() === "assigned" &&
      String(b.cleaner_id ?? "") === params.cleanerId
    ) {
      await logSystemEvent({
        level: "info",
        source: "dispatch_offer_accepted",
        message: "Offer resolved — booking assigned",
        context: {
          bookingId: params.bookingId,
          offerId: params.offerId,
          cleanerId: params.cleanerId,
          latency_ms: Date.now() - t0,
        },
      });
      return "assigned";
    }

    if (ost === "accepted") {
      return "assigned";
    }

    await sleep(POLL_MS);
  }

  const nowIso = new Date().toISOString();
  const { data: still } = await params.supabase
    .from("dispatch_offers")
    .select("status")
    .eq("id", params.offerId)
    .maybeSingle();
  const finalSt = String((still as { status?: string } | null)?.status ?? "");
  if (finalSt === "rejected") {
    return "rejected";
  }
  if (finalSt === "accepted") {
    return "assigned";
  }

  await params.supabase
    .from("dispatch_offers")
    .update({ status: "expired", responded_at: nowIso })
    .eq("id", params.offerId)
    .eq("status", "pending");

  await logSystemEvent({
    level: "info",
    source: "dispatch_offer_expired",
    message: "Dispatch offer expired",
    context: {
      bookingId: params.bookingId,
      offerId: params.offerId,
      cleanerId: params.cleanerId,
      latency_ms: Date.now() - t0,
    },
  });

  await tryEmitDispatchOfferTimeoutMetric({
    supabase: params.supabase,
    offerId: params.offerId,
    bookingId: params.bookingId,
    cleanerId: params.cleanerId,
    latencyMs: Date.now() - t0,
    source: "poll_deadline",
  });

  return "expired";
}

export type AcceptDispatchOfferFailure =
  | "not_found"
  | "wrong_cleaner"
  | "not_pending"
  | "expired"
  | "not_visible_yet"
  | "booking_taken"
  | "assigned_other"
  | "db";

/** Stable machine codes for clients (HTTP JSON) — extends without breaking `failure`. */
export type AcceptDispatchOfferMachineReason = "already_taken";

export type AcceptDispatchOfferResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      failure: AcceptDispatchOfferFailure;
      machineReason?: AcceptDispatchOfferMachineReason;
    };

export async function acceptDispatchOffer(params: {
  supabase: SupabaseClient;
  offerId: string;
  cleanerId: string;
}): Promise<AcceptDispatchOfferResult> {
  const { data: offer, error: oErr } = await params.supabase
    .from("dispatch_offers")
    .select(
      "id, booking_id, cleaner_id, status, created_at, ux_variant, expires_at, whatsapp_sent_at, sms_sent_at, dispatch_tier, dispatch_visible_at",
    )
    .eq("id", params.offerId)
    .maybeSingle();

  if (oErr || !offer) return { ok: false, error: "Offer not found.", failure: "not_found" };
  const row = offer as {
    booking_id?: string;
    cleaner_id?: string;
    status?: string;
    created_at?: string;
    ux_variant?: string | null;
    expires_at?: string;
    whatsapp_sent_at?: string | null;
    sms_sent_at?: string | null;
    dispatch_tier?: string | null;
    dispatch_visible_at?: string | null;
  };
  const ux_variant = sanitizeCleanerUxVariant(row.ux_variant);
  if (String(row.cleaner_id) !== params.cleanerId) {
    return { ok: false, error: "Not your offer.", failure: "wrong_cleaner" };
  }
  if (String(row.status) !== "pending") {
    console.log("[OFFER ALREADY HANDLED]", { offerId: params.offerId, status: row.status, phase: "accept" });
    return { ok: false, error: "Offer is no longer pending.", failure: "not_pending" };
  }
  const visRaw = row.dispatch_visible_at;
  const visMs = visRaw ? new Date(visRaw).getTime() : NaN;
  if (Number.isFinite(visMs) && Date.now() < visMs) {
    return { ok: false, error: "Offer is not visible yet.", failure: "not_visible_yet" };
  }
  const expRaw = row.expires_at;
  const expMs = expRaw ? new Date(expRaw).getTime() : NaN;
  if (Number.isFinite(expMs) && Date.now() >= expMs) {
    return { ok: false, error: "Offer expired.", failure: "expired" };
  }

  const bookingId = String(row.booking_id ?? "");
  if (!bookingId) return { ok: false, error: "Invalid offer.", failure: "not_found" };

  const now = new Date().toISOString();
  const createdAt = row.created_at ? new Date(row.created_at).getTime() : Date.now();
  const anchorForLatency = row.whatsapp_sent_at
    ? new Date(row.whatsapp_sent_at).getTime()
    : row.sms_sent_at
      ? new Date(row.sms_sent_at).getTime()
      : createdAt;
  const responseLatencyMs = Math.max(0, Date.now() - (Number.isFinite(anchorForLatency) ? anchorForLatency : Date.now()));
  const latencyMs = responseLatencyMs;

  const { data: bookingBefore } = await params.supabase
    .from("bookings")
    .select("status, cleaner_id, date, time, location_id, city_id")
    .eq("id", bookingId)
    .maybeSingle();
  const bs = bookingBefore as { status?: string; cleaner_id?: string | null } | null;
  if (bs && String(bs.status ?? "").toLowerCase() === "assigned" && String(bs.cleaner_id ?? "") !== params.cleanerId) {
    await params.supabase
      .from("dispatch_offers")
      .update({ status: "expired", responded_at: now, response_latency_ms: responseLatencyMs })
      .eq("id", params.offerId)
      .eq("status", "pending");
    void notifyCleanerDispatchOfferLostRaceSms({
      supabase: params.supabase,
      bookingId,
      cleanerId: params.cleanerId,
      offerId: params.offerId,
    });
    return {
      ok: false,
      error: "Another cleaner was assigned.",
      failure: "assigned_other",
      machineReason: "already_taken",
    };
  }

  const bsMeta = bookingBefore as {
    status?: string;
    cleaner_id?: string | null;
    date?: string | null;
    time?: string | null;
    location_id?: string | null;
    city_id?: string | null;
  } | null;
  const assignMeta = await marketplaceBookingPatchOnAssign(params.supabase, {
    date: bsMeta?.date ?? null,
    time: bsMeta?.time ?? null,
    location_id: bsMeta?.location_id ?? null,
    city_id: bsMeta?.city_id ?? null,
  });

  const { data: updatedRows, error: uBook } = await params.supabase
    .from("bookings")
    .update({
      cleaner_id: params.cleanerId,
      payout_owner_cleaner_id: params.cleanerId,
      status: "assigned",
      dispatch_status: "assigned",
      assigned_at: now,
      cleaner_response_status: CLEANER_RESPONSE.PENDING,
      ...assignMeta,
    })
    .eq("id", bookingId)
    .neq("status", "assigned")
    .in("status", ["pending", "pending_assignment"])
    .neq("dispatch_status", "assigned")
    .select("id");

  if (uBook) {
    return { ok: false, error: uBook.message, failure: "db" };
  }
  if (!updatedRows?.length) {
    await params.supabase
      .from("dispatch_offers")
      .update({ status: "expired", responded_at: now, response_latency_ms: responseLatencyMs })
      .eq("id", params.offerId)
      .eq("status", "pending");
    void notifyCleanerDispatchOfferLostRaceSms({
      supabase: params.supabase,
      bookingId,
      cleanerId: params.cleanerId,
      offerId: params.offerId,
    });
    return {
      ok: false,
      error: "Booking was already assigned.",
      failure: "booking_taken",
      machineReason: "already_taken",
    };
  }

  const { error: exErr } = await params.supabase.rpc("dispatch_expire_peer_offers", {
    p_booking_id: bookingId,
    p_winner_offer_id: params.offerId,
  });
  if (exErr) {
    await logSystemEvent({
      level: "warn",
      source: "dispatch_expire_peers",
      message: exErr.message,
      context: { bookingId, offerId: params.offerId },
    });
  }

  await params.supabase
    .from("dispatch_offers")
    .update({ status: "accepted", responded_at: now, response_latency_ms: responseLatencyMs })
    .eq("id", params.offerId)
    .eq("status", "pending");

  const { error: rpcErr } = await params.supabase.rpc("dispatch_cleaner_offer_accepted", {
    p_cleaner_id: params.cleanerId,
  });
  if (rpcErr) {
    await logSystemEvent({
      level: "warn",
      source: "dispatch_offer_accept_stats",
      message: rpcErr.message,
      context: { offerId: params.offerId, cleanerId: params.cleanerId, bookingId },
    });
  }

  const { error: metErr } = await params.supabase.rpc("dispatch_record_offer_response", {
    p_cleaner_id: params.cleanerId,
    p_latency_ms: latencyMs,
    p_accepted: true,
  });
  if (metErr) {
    await logSystemEvent({
      level: "warn",
      source: "dispatch_offer_metrics",
      message: metErr.message,
      context: { offerId: params.offerId, cleanerId: params.cleanerId },
    });
  }

  await syncCleanerBusyFromBookings(params.supabase, params.cleanerId);
  await params.supabase.from("cleaners").update({ is_available: false }).eq("id", params.cleanerId);

  await logSystemEvent({
    level: "info",
    source: "dispatch_offer_accepted",
    message: "Offer accepted (API)",
    context: {
      bookingId,
      cleanerId: params.cleanerId,
      offerId: params.offerId,
      latency_ms: latencyMs,
      dispatch_tier: row.dispatch_tier ?? null,
    },
  });

  console.log("[ASSIGNMENT TRIGGERED]", { bookingId, cleanerId: params.cleanerId, offerId: params.offerId });
  void notifyCleanerAssignedBooking(params.supabase, bookingId, params.cleanerId);

  const seg = await loadDispatchMetricSegmentation(params.supabase, bookingId);
  const segFields = {
    assignment_type: seg.assignment_type,
    fallback_reason: seg.fallback_reason,
    attempt_number: seg.attempt_number,
    location: seg.location,
    offer_cohort_tags: true as const,
  };
  const metricTags = compactDispatchMetricTags(segFields);

  metrics.increment("dispatch.offer.accepted", {
    bookingId,
    cleanerId: params.cleanerId,
    offerId: params.offerId,
    latency_ms: latencyMs,
    ux_variant,
    dispatch_tier: row.dispatch_tier ?? undefined,
    ...metricTags,
  });

  metrics.increment("dispatch.kpi.time_to_accept_ms", {
    bookingId,
    cleanerId: params.cleanerId,
    offerId: params.offerId,
    ms: latencyMs,
    ux_variant,
    ...metricTags,
  });

  const { count: offersForBooking, error: offerCountErr } = await params.supabase
    .from("dispatch_offers")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", bookingId);
  if (!offerCountErr) {
    metrics.increment("dispatch.kpi.offers_per_booking", {
      bookingId,
      cleanerId: params.cleanerId,
      count: offersForBooking ?? 0,
      ux_variant,
      ...metricTags,
    });
  }

  void learnFromCleanerAcceptance(params.supabase, {
    cleanerId: params.cleanerId,
    bookingId,
  });

  try {
    const { count: sentCount, error: scErr } = await params.supabase
      .from("dispatch_offers")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", bookingId);
    if (!scErr) {
      const { error: dmErr } = await params.supabase.from("dispatch_metrics").insert({
        booking_id: bookingId,
        cleaner_id: params.cleanerId,
        time_to_accept_ms: Math.round(Math.min(2_147_483_647, Math.max(0, latencyMs))),
        offers_sent: Math.min(2_147_483_647, Math.max(0, sentCount ?? 0)),
      });
      if (dmErr) {
        await logSystemEvent({
          level: "warn",
          source: "dispatch_metrics_insert",
          message: dmErr.message,
          context: { bookingId, cleanerId: params.cleanerId, offerId: params.offerId },
        });
      }
    }
  } catch (e) {
    await logSystemEvent({
      level: "warn",
      source: "dispatch_metrics_insert",
      message: e instanceof Error ? e.message : String(e),
      context: { bookingId, cleanerId: params.cleanerId },
    });
  }

  return { ok: true };
}

export type RejectDispatchOfferFailure =
  | "not_found"
  | "wrong_cleaner"
  | "not_pending"
  | "expired"
  | "not_visible_yet"
  | "db";

export type RejectDispatchOfferResult =
  | { ok: true }
  | { ok: false; error: string; failure: RejectDispatchOfferFailure };

export async function rejectDispatchOffer(params: {
  supabase: SupabaseClient;
  offerId: string;
  cleanerId: string;
}): Promise<RejectDispatchOfferResult> {
  const { data: offer, error: oErr } = await params.supabase
    .from("dispatch_offers")
    .select(
      "id, cleaner_id, status, booking_id, created_at, ux_variant, expires_at, whatsapp_sent_at, sms_sent_at, dispatch_visible_at",
    )
    .eq("id", params.offerId)
    .maybeSingle();

  if (oErr || !offer) return { ok: false, error: "Offer not found.", failure: "not_found" };
  const row = offer as {
    cleaner_id?: string;
    status?: string;
    booking_id?: string;
    created_at?: string;
    ux_variant?: string | null;
    expires_at?: string;
    whatsapp_sent_at?: string | null;
    sms_sent_at?: string | null;
    dispatch_visible_at?: string | null;
  };
  if (String(row.cleaner_id) !== params.cleanerId) {
    return { ok: false, error: "Not your offer.", failure: "wrong_cleaner" };
  }
  if (String(row.status) !== "pending") {
    return { ok: false, error: "Offer is no longer pending.", failure: "not_pending" };
  }
  const visRaw = row.dispatch_visible_at;
  const visMs = visRaw ? new Date(visRaw).getTime() : NaN;
  if (Number.isFinite(visMs) && Date.now() < visMs) {
    return { ok: false, error: "Offer is not visible yet.", failure: "not_visible_yet" };
  }
  const expRaw = row.expires_at;
  const expMs = expRaw ? new Date(expRaw).getTime() : NaN;
  if (Number.isFinite(expMs) && Date.now() >= expMs) {
    return { ok: false, error: "Offer expired.", failure: "expired" };
  }

  const bookingId = String(row.booking_id ?? "");
  if (!bookingId) return { ok: false, error: "Invalid offer.", failure: "not_found" };

  const now = new Date().toISOString();
  const createdAt = row.created_at ? new Date(row.created_at).getTime() : Date.now();
  const anchorForLatencyReject = row.whatsapp_sent_at
    ? new Date(row.whatsapp_sent_at).getTime()
    : row.sms_sent_at
      ? new Date(row.sms_sent_at).getTime()
      : createdAt;
  const responseLatencyMs = Math.max(
    0,
    Date.now() - (Number.isFinite(anchorForLatencyReject) ? anchorForLatencyReject : Date.now()),
  );
  const latencyMs = responseLatencyMs;

  const { error } = await params.supabase
    .from("dispatch_offers")
    .update({ status: "rejected", responded_at: now, response_latency_ms: responseLatencyMs })
    .eq("id", params.offerId)
    .eq("status", "pending");

  if (error) return { ok: false, error: error.message, failure: "db" };

  const { error: metErr } = await params.supabase.rpc("dispatch_record_offer_response", {
    p_cleaner_id: params.cleanerId,
    p_latency_ms: latencyMs,
    p_accepted: false,
  });
  if (metErr) {
    await logSystemEvent({
      level: "warn",
      source: "dispatch_offer_metrics",
      message: metErr.message,
      context: { offerId: params.offerId, cleanerId: params.cleanerId },
    });
  }

  await logSystemEvent({
    level: "info",
    source: "dispatch_offer_rejected",
    message: "Offer rejected (API)",
    context: {
      bookingId,
      cleanerId: params.cleanerId,
      offerId: params.offerId,
      latency_ms: latencyMs,
    },
  });

  void logSystemEvent({
    level: "info",
    source: "cleaner_declined",
    message: "Marketplace intelligence: cleaner declined dispatch offer",
    context: {
      bookingId,
      cleanerId: params.cleanerId,
      offerId: params.offerId,
      latency_ms: latencyMs,
    },
  });

  await notifyCleanerOfferDeclined({
    cleanerId: params.cleanerId,
    bookingId,
    offerId: params.offerId,
  });

  const segDecline = await loadDispatchMetricSegmentation(params.supabase, bookingId);
  const declineTags = compactDispatchMetricTags({
    assignment_type: segDecline.assignment_type,
    fallback_reason: segDecline.fallback_reason,
    attempt_number: segDecline.attempt_number,
    location: segDecline.location,
    offer_cohort_tags: true as const,
  });
  const ux_variant = sanitizeCleanerUxVariant(row.ux_variant);
  metrics.increment("dispatch.offer.declined", {
    bookingId,
    cleanerId: params.cleanerId,
    offerId: params.offerId,
    latency_ms: latencyMs,
    ux_variant,
    ...declineTags,
  });

  await maybeRedispatchPendingBookingIfOffersExhausted(params.supabase, {
    bookingId,
    rejectedCleanerId: params.cleanerId,
    skipBackoffScheduling: true,
  });

  return { ok: true };
}

/**
 * Sends SMS for tier-deferred offers once `dispatch_visible_at` has passed (minute cron).
 */
export async function processDeferredDispatchOfferNotifications(
  supabase: SupabaseClient,
): Promise<{ attempted: number; sent: number }> {
  const nowIso = new Date().toISOString();
  const { data: rows, error } = await supabase
    .from("dispatch_offers")
    .select("id, booking_id, cleaner_id, expires_at, offer_token")
    .eq("status", "pending")
    .eq("offer_notification_deferred", true)
    .lte("dispatch_visible_at", nowIso)
    .is("sms_sent_at", null)
    .limit(40);

  if (error || !rows?.length) {
    return { attempted: 0, sent: 0 };
  }

  let sent = 0;
  for (const raw of rows as Array<{
    id: string;
    booking_id: string;
    cleaner_id: string;
    expires_at: string;
    offer_token: string;
  }>) {
    const offerId = String(raw.id);
    const bookingId = String(raw.booking_id);
    const cleanerId = String(raw.cleaner_id);
    const expiresAtIso = String(raw.expires_at);
    const offerToken = String(raw.offer_token ?? "");
    try {
      await notifyCleanerOfDispatchOffer({
        bookingId,
        offerId,
        cleanerId,
        expiresAtIso,
        offerToken,
      });
      await supabase
        .from("dispatch_offers")
        .update({ offer_notification_deferred: false })
        .eq("id", offerId)
        .eq("status", "pending");
      sent++;
    } catch {
      /* notifyCleanerOfDispatchOffer logs failures */
    }
  }

  return { attempted: rows.length, sent };
}
