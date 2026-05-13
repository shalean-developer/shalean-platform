import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { syncCleanerBusyFromBookings } from "@/lib/cleaner/syncCleanerStatus";
import { syncBookingDispatchExpiredWhenNoPendingOffers } from "@/lib/dispatch/syncBookingDispatchExpiredWhenNoPendingOffers";
import { bumpCleanerOfferSentCounter } from "@/lib/dispatch/dispatchOfferCounterRpc";
import { resolveAndPersistDispatchOfferEarningsSnapshot } from "@/lib/dispatch/dispatchOfferEarningsSnapshot";
import {
  notifyCleanerDispatchOfferLostRaceSms,
  notifyCleanerOfDispatchOffer,
  notifyCleanerOfferDeclined,
} from "@/lib/dispatch/offerNotifications";
import { triggerAssignmentEarningsSnapshotForBooking } from "@/lib/admin/triggerAssignmentEarningsSnapshot";
import { tryEmitDispatchOfferTimeoutMetric } from "@/lib/dispatch/offerTimeoutMetric";
import {
  compactDispatchMetricTags,
  firstOfferMetricAnchorIso,
  loadDispatchMetricSegmentation,
} from "@/lib/dispatch/dispatchMetricContext";
import { assignCleanerUxVariantForCleaner, sanitizeCleanerUxVariant } from "@/lib/cleaner/cleanerOfferUxVariant";
import { learnFromCleanerAcceptance } from "@/lib/ai-autonomy/learningLoop";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { metrics } from "@/lib/metrics/counters";
import { notifyCleanerAssignedBooking } from "@/lib/dispatch/notifyCleanerAssigned";
import { maybeRedispatchPendingBookingIfOffersExhausted } from "@/lib/dispatch/redispatchAfterOfferReject";
import { marketplaceBookingPatchOnAssign } from "@/lib/marketplace-intelligence/marketplaceBookingMeta";
import { assignmentTruthPatchForOfferAccept } from "@/lib/dispatch/assignmentTruth";

const POLL_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type CreateDispatchOfferRowResult =
  | { ok: true; offerId: string; expiresAtIso: string }
  | { ok: false; error: string };

/**
 * Command boundary for the booking-level dispatch offer state.
 * Phase 1C preserves the existing fire-and-forget update behavior exactly.
 */
export async function setBookingDispatchOffered(params: {
  supabase: SupabaseClient;
  bookingId: string;
}): Promise<void> {
  await params.supabase
    .from("bookings")
    .update({ dispatch_status: "offered" })
    .eq("id", params.bookingId);
}

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

  if (priorCountErr) {
    await logSystemEvent({
      level: "warn",
      source: "dispatch_offer_prior_count",
      message: priorCountErr.message,
      context: { bookingId: params.bookingId },
    });
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
    await logSystemEvent({
      level: "warn",
      source: "dispatch_offer_insert",
      message: msg,
      context: { bookingId: params.bookingId, cleanerId: params.cleanerId },
    });
    return { ok: false, error: msg };
  }

  const offerId = String(data.id);
  // Counter bump is best-effort: never block offer creation. The wrapper
  // classifies missing-column errors (schema gap vs runtime fault) and
  // chooses the appropriate log level + metric.
  await bumpCleanerOfferSentCounter({
    supabase: params.supabase,
    cleanerId: params.cleanerId,
    bookingId: params.bookingId,
    offerId,
  });

  /**
   * Compute & persist the per-(booking, cleaner) cleaner earnings snapshot
   * onto `dispatch_offers`. This is the canonical "earning persisted before
   * offer is shown" guarantee from the cleaner-offer earnings audit:
   * /api/cleaner/offers reads `dispatch_offers.display_earnings_cents`
   * before falling back to the runtime preview helper, so the cleaner sees
   * a real amount instead of "Job earning unavailable" on every solo offer.
   *
   * Best-effort: a missing snapshot still lets the offer go out (the route
   * falls back to the runtime preview, which now also accepts pending-offer
   * cleaners as eligible). Errors are logged via system_logs and never
   * bubble out — dispatch latency must not regress.
   */
  void resolveAndPersistDispatchOfferEarningsSnapshot({
    supabase: params.supabase,
    bookingId: params.bookingId,
    cleanerId: params.cleanerId,
    offerId,
  }).catch(() => {
    /** All failure modes are already logged inside the helper. */
  });

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
    await logSystemEvent({
      level: "error",
      source: "dispatch_offer_sms_notify",
      message: err instanceof Error ? err.message : String(err),
      context: { bookingId: params.bookingId, cleanerId: params.cleanerId, offerId },
    });
  }

  await setBookingDispatchOffered({
    supabase: params.supabase,
    bookingId: params.bookingId,
  });

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

  await syncBookingDispatchExpiredWhenNoPendingOffers(params.supabase, params.bookingId);

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

/**
 * M-12: failure codes the atomic RPC may return. Used to defensively narrow
 * the JSONB result to a known TypeScript union — anything outside this set
 * is treated as `db` so the API contract never widens silently.
 */
const KNOWN_ACCEPT_FAILURES = new Set<AcceptDispatchOfferFailure>([
  "not_found",
  "wrong_cleaner",
  "not_pending",
  "expired",
  "not_visible_yet",
  "booking_taken",
  "assigned_other",
  "db",
]);

const ACCEPT_FAILURE_MESSAGES: Record<AcceptDispatchOfferFailure, string> = {
  not_found: "Offer not found.",
  wrong_cleaner: "Not your offer.",
  not_pending: "Offer is no longer pending.",
  expired: "Offer expired.",
  not_visible_yet: "Offer is not visible yet.",
  booking_taken: "Booking was already assigned.",
  assigned_other: "Another cleaner was assigned.",
  db: "Offer accept failed.",
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
    await logSystemEvent({
      level: "info",
      source: "dispatch_offer_accept_idempotent",
      message: "dispatch.offer.accept_not_pending",
      context: {
        offerId: params.offerId,
        status: row.status,
        bookingId: typeof row.booking_id === "string" ? row.booking_id : null,
      },
    });
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
    .select(
      "date, time, location_id, city_id, assignment_type, selected_cleaner_id",
    )
    .eq("id", bookingId)
    .maybeSingle();

  const bsMeta = bookingBefore as {
    date?: string | null;
    time?: string | null;
    location_id?: string | null;
    city_id?: string | null;
    assignment_type?: string | null;
    selected_cleaner_id?: string | null;
  } | null;
  const assignMeta = await marketplaceBookingPatchOnAssign(params.supabase, {
    date: bsMeta?.date ?? null,
    time: bsMeta?.time ?? null,
    location_id: bsMeta?.location_id ?? null,
    city_id: bsMeta?.city_id ?? null,
  });

  const truthPatch = assignmentTruthPatchForOfferAccept({
    acceptedCleanerId: params.cleanerId,
    assignmentTypeBefore: bsMeta?.assignment_type,
    selectedCleanerId: bsMeta?.selected_cleaner_id,
  });

  /**
   * M-12: atomic accept. Replaces the previous multi-step sequence
   *   (1) bookings UPDATE → (2) dispatch_offers UPDATE → (3) peer expire
   * with a single transaction inside `accept_dispatch_offer_atomic`. The
   * RPC locks the offer + booking rows, validates pending / assignability /
   * expiry / cleaner identity, and applies all writes atomically — closing
   * the race where a concurrent admin reassignment landing between (1) and
   * (2) could leave a pending offer behind for a no-longer-assignable
   * booking.
   *
   * The RPC also performs the peer-offer expiry that was previously the
   * separate `dispatch_expire_peer_offers` RPC. Booking meta computed
   * above (`assignMeta` + `truthPatch`) is forwarded as JSONB so the
   * entire assignment write is one atomic statement.
   *
   * Failure shape returned by the RPC mirrors `AcceptDispatchOfferResult`
   * exactly so callers (cleaner offers API, WhatsApp accept handler) keep
   * their existing branching unchanged.
   */
  const { data: rpcRaw, error: rpcUpdateErr } = await params.supabase.rpc(
    "accept_dispatch_offer_atomic",
    {
      p_offer_id: params.offerId,
      p_cleaner_id: params.cleanerId,
      p_response_latency_ms: Math.min(2_147_483_647, Math.max(0, Math.round(responseLatencyMs))),
      p_assign_meta: assignMeta as unknown as Record<string, unknown>,
      p_truth_patch: truthPatch as unknown as Record<string, unknown>,
    },
  );

  if (rpcUpdateErr) {
    return { ok: false, error: rpcUpdateErr.message, failure: "db" };
  }

  const rpcResult = (rpcRaw ?? {}) as {
    ok?: boolean;
    failure?: AcceptDispatchOfferFailure;
    machine_reason?: AcceptDispatchOfferMachineReason | null;
    booking_id?: string | null;
    expired_peers?: number;
  };

  if (rpcResult.ok !== true) {
    const failure: AcceptDispatchOfferFailure =
      rpcResult.failure && KNOWN_ACCEPT_FAILURES.has(rpcResult.failure)
        ? rpcResult.failure
        : "db";
    if (failure === "assigned_other" || failure === "booking_taken") {
      void notifyCleanerDispatchOfferLostRaceSms({
        supabase: params.supabase,
        bookingId,
        cleanerId: params.cleanerId,
        offerId: params.offerId,
      });
    }
    await logSystemEvent({
      level: "info",
      source: "dispatch_offer_accept_atomic_reject",
      message: `accept_atomic_${failure}`,
      context: {
        offerId: params.offerId,
        bookingId,
        cleanerId: params.cleanerId,
        failure,
        machineReason: rpcResult.machine_reason ?? null,
      },
    });
    return {
      ok: false,
      error: ACCEPT_FAILURE_MESSAGES[failure] ?? "Offer accept failed.",
      failure,
      ...(rpcResult.machine_reason ? { machineReason: rpcResult.machine_reason } : {}),
    };
  }

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

  // INVARIANT: accepting an offer ONLY updates workload (`cleaners.status` via
  // `syncCleanerBusyFromBookings`). It MUST NOT touch `cleaners.is_available`,
  // which is the cleaner's manual willingness flag — that field is owned
  // exclusively by the manual Go online / Go offline toggle in
  // `apps/web/app/api/cleaner/me/route.ts` (PATCH). Overloading
  // `is_available` here was the cause of cleaners showing as Paused / Go
  // online on the dashboard immediately after acceptance, and silently
  // removed them from `getEligibleCleaners` for all future non-overlapping
  // slots until they manually re-toggled. See
  // `dispatchOfferAcceptPreservesAvailability.test.ts` for the regression
  // guard.
  await syncCleanerBusyFromBookings(params.supabase, params.cleanerId);

  /**
   * M-8: assignment-mutation snapshot trigger.
   * Marketplace flow only writes `cleaner_id` + `payout_owner_cleaner_id` here (offer accept).
   * Without this call, monthly bookings dispatched through the offer funnel would have no
   * `display_earnings_cents` basis on the booking row until completion, even though the offer
   * snapshot is already on `dispatch_offers.display_earnings_cents`.
   * Idempotent: persistCleanerPayoutIfUnset is a no-op when the basis already exists.
   */
  await triggerAssignmentEarningsSnapshotForBooking(params.supabase, bookingId, "acceptDispatchOffer");

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

  // M-16: dispatch_metrics is a write-only KPI sink (RLS denies reads from
  // anon/authenticated; service role only). A failed insert here MUST NEVER
  // block the accept response — the customer/cleaner has already been
  // assigned and notified upstream. We escalate any failure to
  // `reportOperationalIssue` (console.warn + system_logs persist) so the
  // observability gap that was previously hidden under a silent
  // `if (!scErr) { ... }` (count-query failure → no metric, no log) becomes
  // visible. Three independent failure modes, all logged, none rethrown:
  //   1. The prerequisite `dispatch_offers` count query fails →
  //      we record the failure and skip the insert (cannot derive
  //      `offers_sent` without it).
  //   2. The insert returns a Postgrest error (constraint, FK, RLS surprise) →
  //      we record `dmErr.message`.
  //   3. An unexpected exception escapes the count or insert (network drop,
  //      thrown serializer, etc.) → caught here, recorded, and swallowed.
  // In every case `acceptDispatchOffer` proceeds to `return { ok: true }`.
  try {
    const { count: sentCount, error: scErr } = await params.supabase
      .from("dispatch_offers")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", bookingId);
    if (scErr) {
      // Previously silent — `if (!scErr) { ... }` short-circuited with no log.
      // Now reported so a sustained query-side failure (RLS regression,
      // schema drift, broken connection pool) shows up on dashboards.
      await reportOperationalIssue(
        "warn",
        "dispatch_metrics_insert",
        `offers count for dispatch_metrics insert failed: ${scErr.message}`,
        { bookingId, cleanerId: params.cleanerId, offerId: params.offerId },
      );
    } else {
      const { error: dmErr } = await params.supabase.from("dispatch_metrics").insert({
        booking_id: bookingId,
        cleaner_id: params.cleanerId,
        time_to_accept_ms: Math.round(Math.min(2_147_483_647, Math.max(0, latencyMs))),
        offers_sent: Math.min(2_147_483_647, Math.max(0, sentCount ?? 0)),
      });
      if (dmErr) {
        await reportOperationalIssue(
          "warn",
          "dispatch_metrics_insert",
          `dispatch_metrics insert failed: ${dmErr.message}`,
          { bookingId, cleanerId: params.cleanerId, offerId: params.offerId },
        );
      }
    }
  } catch (e) {
    await reportOperationalIssue(
      "warn",
      "dispatch_metrics_insert",
      `dispatch_metrics insert threw: ${e instanceof Error ? e.message : String(e)}`,
      { bookingId, cleanerId: params.cleanerId, offerId: params.offerId },
    );
  }

  return { ok: true };
}

/**
 * Command boundary for dispatch offer acceptance.
 * Phase 1C delegates to the existing accept flow unchanged; the
 * accept_dispatch_offer_atomic RPC remains owned by acceptDispatchOffer.
 */
export async function acceptBookingDispatchOffer(params: {
  supabase: SupabaseClient;
  offerId: string;
  cleanerId: string;
}): Promise<AcceptDispatchOfferResult> {
  return acceptDispatchOffer(params);
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

  await syncBookingDispatchExpiredWhenNoPendingOffers(params.supabase, bookingId);

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
