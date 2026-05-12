import { NextResponse } from "next/server";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { optionalCentsFromDb } from "@/lib/cleaner/cleanerJobDisplayEarningsResolve";
import { resolveCleanerEarningsCents } from "@/lib/cleaner/resolveCleanerEarnings";
import {
  cleanerJobEarningFromCents,
  type CleanerJobEarning,
} from "@/lib/cleaner/cleanerJobEarning";
import {
  isDispatchOfferUnclaimedForCleaner,
  isDispatchOfferVisibleNow,
} from "@/lib/cleaner/dispatchOffersVisibility";
import { previewDisplayEarningsCentsForCleanerJobDiagnostic } from "@/lib/payout/persistCleanerPayout";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cap on `previewDisplayEarningsCentsForCleanerJob` calls per request.
 * The pending-offer list is already limited to 20 rows below; this matches
 * `DEFAULT_CLEANER_JOB_EARNINGS_PREVIEW_CAP` used by `/api/cleaner/dashboard`.
 */
const OFFER_EARNINGS_PREVIEW_CAP = 20;

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });
  const cleanerId = session.cleanerId;
  const nowIso = new Date().toISOString();

  const { data: offersRaw, error } = await admin
    .from("dispatch_offers")
    .select(
      "id, booking_id, cleaner_id, status, expires_at, created_at, ux_variant, dispatch_tier, dispatch_visible_at, dispatch_tier_window_end_at, offer_token, sms_sent_at, display_earnings_cents, earnings_snapshot_source, earnings_snapshot_at",
    )
    .eq("cleaner_id", cleanerId)
    .eq("status", "pending")
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const nowMs = Date.now();
  /** DB already filters `expires_at > now`; keep a light client-side guard for clock skew. */
  const offers = (offersRaw ?? [])
    .filter((o) => isDispatchOfferVisibleNow(o, nowMs))
    .slice(0, 20);

  const bookingIds = [...new Set(offers.map((o) => String(o.booking_id)).filter(Boolean))];
  let bookingById = new Map<string, Record<string, unknown>>();
  const rosterBookingIdSet = new Set<string>();
  if (bookingIds.length > 0) {
    const { data: rows } = await admin
      .from("bookings")
      .select(
        "id, service, date, time, location, customer_name, customer_phone, status, cleaner_id, total_paid_zar, amount_paid_cents, is_team_job, team_id, team_member_count_snapshot, display_earnings_cents, cleaner_earnings_total_cents, cleaner_payout_cents, booking_snapshot, payout_frozen_cents",
      )
      .in("id", bookingIds);
    bookingById = new Map((rows ?? []).map((r) => [String((r as { id: string }).id), r as Record<string, unknown>]));

    const { data: rosterHits } = await admin.from("booking_cleaners").select("booking_id").eq("cleaner_id", cleanerId).in("booking_id", bookingIds);
    for (const rh of rosterHits ?? []) {
      const bid = String((rh as { booking_id?: string }).booking_id ?? "").trim();
      if (bid) rosterBookingIdSet.add(bid);
    }
  }

  /** Pending dispatch row is stale once the booking is already on this cleaner (solo or team roster). */
  const offersActive = offers.filter((o) => {
    const bid = String((o as { booking_id?: string }).booking_id ?? "").trim();
    const booking = bid
      ? (bookingById.get(bid) as
          | {
              status?: string | null;
              cleaner_id?: string | null;
              is_team_job?: boolean | null;
            }
          | undefined)
      : undefined;
    return isDispatchOfferUnclaimedForCleaner({
      booking: booking ?? null,
      bookingId: bid,
      cleanerId,
      rosterBookingIds: rosterBookingIdSet,
    });
  });

  /**
   * Resolve the per-offer cleaner earning. Source-of-truth precedence
   * (highest wins):
   *   1. `bookings.cleaner_earnings_total_cents` — line-item finalized at completion
   *   2. `bookings.payout_frozen_cents` — settlement-frozen at invoice eligibility
   *   3. `bookings.display_earnings_cents` — first persist by `persistCleanerPayoutIfUnset`
   *   4. `dispatch_offers.display_earnings_cents` — per-(booking, cleaner) snapshot
   *      written at offer creation by `createDispatchOfferRow`. This is the canonical
   *      pre-acceptance source and unblocks every solo offer that previously rendered
   *      "Job earning unavailable".
   *   5. Runtime fallback: `previewDisplayEarningsCentsForCleanerJobDiagnostic` runs
   *      the same canonical engine in-memory without persisting. Used only for
   *      legacy offers created before the snapshot column existed (the repair script
   *      backfills these) and for races where the snapshot write was still in flight.
   *
   * Every resolution is annotated with a stable `source` string so the data-integrity
   * dashboard can break missing-earning offers down by service / payment basis state.
   * Preview calls are capped at {@link OFFER_EARNINGS_PREVIEW_CAP} per request.
   */
  type PersistedEarningSource =
    | "bookings.cleaner_earnings_total_cents"
    | "bookings.payout_frozen_cents"
    | "bookings.display_earnings_cents";

  function classifyPersistedSource(b: Record<string, unknown>): PersistedEarningSource | null {
    const lineTotal = optionalCentsFromDb(b.cleaner_earnings_total_cents);
    if (lineTotal != null && lineTotal > 0) return "bookings.cleaner_earnings_total_cents";
    const frozen = optionalCentsFromDb(b.payout_frozen_cents);
    if (frozen != null && frozen > 0) return "bookings.payout_frozen_cents";
    const display = optionalCentsFromDb(b.display_earnings_cents);
    if (display != null && display >= 0) return "bookings.display_earnings_cents";
    return null;
  }

  /**
   * Acceptance rule: a cleaner-visible offer must show a positive earning. Persisted `0`
   * (legacy / pre-payment basis) is treated as **missing** so we fall through to the
   * dispatch-offer snapshot (Tier 4) and finally the runtime preview (Tier 5). Only
   * strictly positive values are rendered; `0` becomes `earnings_basis_pending: true`
   * ("Job earning unavailable") so the UI never displays `R 0`.
   */
  const isPositive = (n: number | null | undefined): n is number =>
    typeof n === "number" && Number.isFinite(n) && n > 0;

  let previewsUsed = 0;
  const offersOut: Array<Record<string, unknown>> = [];
  for (const o of offersActive) {
    const bookingId = String(o.booking_id);
    const offerId = String(o.id);
    const booking = bookingById.get(bookingId) ?? null;

    const persisted =
      booking == null
        ? null
        : resolveCleanerEarningsCents({
            cleaner_earnings_total_cents: booking.cleaner_earnings_total_cents,
            payout_frozen_cents: booking.payout_frozen_cents,
            display_earnings_cents: optionalCentsFromDb(booking.display_earnings_cents),
          });

    let resolvedCents: number | null = isPositive(persisted) ? persisted : null;
    let resolvedSource: string | null = resolvedCents != null && booking != null ? classifyPersistedSource(booking) : null;
    let earningsBasisPending = false;
    let runtimeFallbackUsed = false;
    let unavailableReason: string | null = null;

    /**
     * Tier 4: per-offer snapshot persisted at dispatch creation. Bypasses the
     * runtime preview entirely and holds the canonical per-cleaner amount.
     */
    if (resolvedCents == null) {
      const snapshotCents = optionalCentsFromDb((o as { display_earnings_cents?: unknown }).display_earnings_cents);
      if (isPositive(snapshotCents)) {
        resolvedCents = snapshotCents;
        resolvedSource = "dispatch_offers.display_earnings_cents";
      }
    }

    /** Tier 5: runtime preview — last resort for legacy offers without snapshot. */
    if (resolvedCents == null && booking != null) {
      if (previewsUsed >= OFFER_EARNINGS_PREVIEW_CAP) {
        earningsBasisPending = true;
        unavailableReason = "preview_cap_exhausted";
      } else {
        previewsUsed += 1;
        runtimeFallbackUsed = true;
        try {
          const diag = await previewDisplayEarningsCentsForCleanerJobDiagnostic(admin, { bookingId, cleanerId });
          if (diag.ok && isPositive(diag.amountCents)) {
            resolvedCents = diag.amountCents;
            resolvedSource = "runtime_preview";
          } else if (diag.ok) {
            unavailableReason = "preview_returned_zero";
          } else {
            unavailableReason = diag.missingReason;
          }
        } catch (e) {
          // Preview is a server-side defensive read; never let a transient
          // failure bubble out and 500 the entire offer list. We surface it
          // through the data-integrity path below when amount stays null.
          const msg = e instanceof Error ? e.message : String(e);
          await reportOperationalIssue("warn", "cleaner_offers_preview_earnings_failed", msg, {
            bookingId,
            cleanerId,
            offerId,
          });
          unavailableReason = `preview_threw:${msg}`;
        }
      }
    } else if (resolvedCents == null && booking == null) {
      unavailableReason = "booking_row_missing";
    }

    /** Final gate: only positive amounts render; clear any stale `0` from upstream payloads. */
    if (!isPositive(resolvedCents)) {
      resolvedCents = null;
      earningsBasisPending = true;
    }

    const jobEarning: CleanerJobEarning = cleanerJobEarningFromCents(resolvedCents);

    /**
     * Structured diagnostic for every offer — both successes (so we can prove
     * snapshot adoption is increasing) and misses (so we can chase stuck
     * bookings). Filtering by `source` in the data-integrity dashboard makes
     * the systemic-vs-isolated question trivial.
     */
    if (jobEarning.amount_cents == null) {
      await logSystemEvent({
        level: "warn",
        source: "cleaner_offer_job_earning_unavailable",
        message: `Could not resolve job earning for offer ${offerId} (booking ${bookingId})`,
        context: {
          offerId,
          bookingId,
          cleanerId,
          finalJobEarning: null,
          source: resolvedSource,
          fallbackUsed: runtimeFallbackUsed,
          unavailableReason,
          earnings_basis_pending: earningsBasisPending,
          hasBookingRow: booking != null,
          hadSnapshot:
            optionalCentsFromDb((o as { display_earnings_cents?: unknown }).display_earnings_cents) != null,
          snapshotSource: (o as { earnings_snapshot_source?: string | null }).earnings_snapshot_source ?? null,
        },
      });
    } else {
      await logSystemEvent({
        level: "info",
        source: "cleaner_offer_job_earning_resolved",
        message: `Resolved job earning for offer ${offerId} via ${resolvedSource ?? "unknown"}`,
        context: {
          offerId,
          bookingId,
          cleanerId,
          finalJobEarning: jobEarning.amount_cents,
          source: resolvedSource,
          fallbackUsed: runtimeFallbackUsed,
        },
      });
    }

    const displayEarningsCents = jobEarning.amount_cents;
    const displayEarningsIsEstimate = false;
    const safeBooking =
      booking == null
        ? null
        : {
            id: booking.id,
            service: booking.service ?? null,
            date: booking.date ?? null,
            time: booking.time ?? null,
            location: booking.location ?? null,
            customer_name: booking.customer_name ?? null,
            customer_phone: booking.customer_phone ?? null,
            status: booking.status ?? null,
            total_paid_zar: booking.total_paid_zar ?? null,
            is_team_job: booking.is_team_job === true,
            team_id: (booking.team_id as string | null | undefined) ?? null,
            teamMemberCount:
              typeof booking.team_member_count_snapshot === "number" &&
              Number.isFinite(booking.team_member_count_snapshot) &&
              booking.team_member_count_snapshot > 0
                ? Math.floor(booking.team_member_count_snapshot)
                : null,
            booking_snapshot: booking.booking_snapshot ?? null,
          };

    offersOut.push({
      ...o,
      displayEarningsCents,
      displayEarningsIsEstimate,
      earnings_cents: displayEarningsCents,
      earnings_estimated: displayEarningsIsEstimate,
      earnings_is_estimate: displayEarningsIsEstimate,
      earnings_basis_pending: earningsBasisPending,
      jobEarning,
      booking: safeBooking,
    });
  }

  return NextResponse.json({ offers: offersOut });
}
