import { NextResponse } from "next/server";
import { cleanerHasBookingAccess } from "@/lib/cleaner/cleanerBookingAccess";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { runCleanerBookingLifecycleAction, type CleanerLifecycleAction } from "@/lib/cleaner/runCleanerBookingLifecycleAction";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { resolveCleanerEarningsCents } from "@/lib/cleaner/resolveCleanerEarnings";
import { countActiveTeamMembersOnDate } from "@/lib/cleaner/teamMemberAvailability";
import {
  isStuckNullEarningsBooking,
  logEligibleOrPaidWithoutFrozen,
  maybeLogStuckNullEarnings,
} from "@/lib/cleaner/cleanerPayoutInvariantLogging";
import { scheduleStuckEarningsRecomputeDebounced } from "@/lib/cleaner/scheduleStuckEarningsRecompute";
import { fetchBookingLineItemsByBookingIds } from "@/lib/cleaner/fetchBookingLineItemsByBookingIds";
import { augmentCleanerBookingWire } from "@/lib/cleaner/cleanerJobWireAugment";
import { cleanerBookingScopeLines } from "@/lib/cleaner/cleanerBookingScopeSummary";
import {
  fetchTeamRosterByBookingIds,
  teamRosterPeersSummary,
  type TeamRosterMemberWire,
} from "@/lib/cleaner/fetchTeamRosterByBookingIds";
import { metrics } from "@/lib/metrics/counters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOOKING_DETAIL_SELECT =
  "id, service, service_slug, rooms, bathrooms, date, time, location, status, total_paid_zar, total_price, price_breakdown, pricing_version_id, amount_paid_cents, customer_name, customer_phone, extras, assigned_at, en_route_at, started_at, completed_at, created_at, booking_snapshot, is_team_job, team_id, team_member_count_snapshot, cleaner_id, payout_owner_cleaner_id, cleaner_response_status, display_earnings_cents, cleaner_earnings_total_cents, cleaner_payout_cents, payout_status, payout_paid_at, payout_frozen_cents";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = await ctx.params;
  if (!bookingId) {
    return NextResponse.json({ error: "Missing booking id." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }
  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });

  const { data: row, error } = await admin.from("bookings").select(BOOKING_DETAIL_SELECT).eq("id", bookingId).maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  const record = row as Record<string, unknown>;
  const canAccess = await cleanerHasBookingAccess(admin, session.cleanerId, {
    id: bookingId,
    cleaner_id: (record.cleaner_id as string | null | undefined) ?? null,
    payout_owner_cleaner_id: (record.payout_owner_cleaner_id as string | null | undefined) ?? null,
    team_id: (record.team_id as string | null | undefined) ?? null,
    is_team_job: record.is_team_job === true,
  });
  if (!canAccess) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  const { data: issueHit } = await admin
    .from("cleaner_job_issue_reports")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("cleaner_id", session.cleanerId)
    .limit(1)
    .maybeSingle();
  const cleaner_has_issue_report = Boolean(issueHit && typeof (issueHit as { id?: string }).id === "string");

  const displayEarningsCents = resolveCleanerEarningsCents({
    cleaner_earnings_total_cents: record.cleaner_earnings_total_cents,
    payout_frozen_cents: record.payout_frozen_cents,
    display_earnings_cents: record.display_earnings_cents,
  });
  const displayEarningsIsEstimate = false;
  const snapRaw = record.team_member_count_snapshot;
  const snapCount =
    typeof snapRaw === "number" && Number.isFinite(snapRaw) && snapRaw > 0 ? Math.floor(snapRaw) : null;
  const { cleaner_payout_cents: _legacyPayout, display_earnings_cents: _displayRaw, team_member_count_snapshot: _snapOmit, ...safe } = record;

  const snap = record.booking_snapshot;
  const snapCust =
    snap && typeof snap === "object" && !Array.isArray(snap)
      ? (snap as { customer?: { name?: string; phone?: string } }).customer
      : undefined;
  const snapCustomerName = typeof snapCust?.name === "string" ? snapCust.name.trim() : "";
  const snapCustomerPhone = typeof snapCust?.phone === "string" ? snapCust.phone.trim() : "";
  const dbName = typeof safe.customer_name === "string" ? safe.customer_name.trim() : "";
  const dbPhone = typeof safe.customer_phone === "string" ? safe.customer_phone.trim() : "";
  const customer_name = snapCustomerName || dbName || null;
  const customer_phone = snapCustomerPhone || dbPhone || null;

  let teamMemberCount: number | null = null;
  if (record.is_team_job === true) {
    if (snapCount != null) {
      teamMemberCount = snapCount;
    } else {
      const teamId = String(record.team_id ?? "").trim();
      const dateRaw = typeof record.date === "string" ? record.date : "";
      const dateYmd = dateRaw.trim().slice(0, 10);
      if (teamId && /^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
        const { data: rosterRows, error: rosterErr } = await admin
          .from("team_members")
          .select("team_id, cleaner_id, active_from, active_to")
          .eq("team_id", teamId)
          .not("cleaner_id", "is", null);
        if (!rosterErr) {
          const n = countActiveTeamMembersOnDate((rosterRows ?? []) as { cleaner_id?: string | null; active_from?: string | null; active_to?: string | null }[], dateYmd);
          teamMemberCount = n > 0 ? n : null;
        }
      }
    }
  }

  logEligibleOrPaidWithoutFrozen(bookingId, record);
  maybeLogStuckNullEarnings(bookingId, record);
  if (isStuckNullEarningsBooking(record)) {
    scheduleStuckEarningsRecomputeDebounced({
      admin,
      bookingId,
      cleanerId: session.cleanerId,
      recomputeSource: "job_detail",
    });
  }

  const lineMap = await fetchBookingLineItemsByBookingIds(admin, [bookingId]);
  const lineItems = lineMap.get(bookingId) ?? null;
  const scope_lines = cleanerBookingScopeLines({
    rooms: record.rooms,
    bathrooms: record.bathrooms,
    extras: record.extras,
    booking_snapshot: record.booking_snapshot,
    lineItems,
  });

  let team_roster: TeamRosterMemberWire[] = [];
  let team_roster_summary: string | null = null;
  if (record.is_team_job === true) {
    const rosterMap = await fetchTeamRosterByBookingIds(admin, [bookingId]);
    team_roster = rosterMap.get(bookingId) ?? [];
    team_roster_summary = teamRosterPeersSummary(team_roster, session.cleanerId);
  }

  return NextResponse.json({
    job: {
      ...safe,
      server_now_ms: Date.now(),
      customer_name,
      customer_phone,
      scope_lines,
      lineItems: lineItems && lineItems.length > 0 ? lineItems : null,
      displayEarningsCents,
      displayEarningsIsEstimate,
      earnings_cents: displayEarningsCents,
      earnings_estimated: displayEarningsIsEstimate,
      teamMemberCount,
      team_roster,
      team_roster_summary,
      cleaner_has_issue_report,
      ...augmentCleanerBookingWire(record as Record<string, unknown>, session.cleanerId),
    },
  });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: bookingId } = await ctx.params;
  if (!bookingId) {
    return NextResponse.json({ error: "Missing booking id." }, { status: 400 });
  }

  let body: { action?: string; idempotency_key?: string };
  try {
    body = (await request.json()) as { action?: string; idempotency_key?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const action = (typeof body.action === "string" ? body.action.trim() : "") as CleanerLifecycleAction;
  const allowedActions: CleanerLifecycleAction[] = ["accept", "reject", "en_route", "start", "complete"];
  if (!allowedActions.includes(action)) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  /** Client-generated UUID per gesture; add a lifecycle phase token later if replays need stricter scoping. */
  const idempotency_key = typeof body.idempotency_key === "string" ? body.idempotency_key.trim() : "";
  if (idempotency_key.length < 10) {
    void logSystemEvent({
      level: "warn",
      source: "cleaner_job_lifecycle",
      message: "job_action_failed",
      context: { reason: "missing_idempotency_key", booking_id: bookingId },
    });
    return NextResponse.json({ error: "Missing or invalid idempotency_key." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }
  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });

  void logSystemEvent({
    level: "info",
    source: "cleaner_job_lifecycle",
    message: "job_action_attempted",
    context: {
      booking_id: bookingId,
      cleaner_id: session.cleanerId,
      action,
      idempotency_key,
    },
  });

  const { error: claimErr } = await admin.from("cleaner_job_lifecycle_idempotency").insert({
    cleaner_id: session.cleanerId,
    booking_id: bookingId,
    idempotency_key,
    action,
  });

  if (claimErr) {
    const dup =
      claimErr.code === "23505" ||
      /duplicate key|unique constraint/i.test(String(claimErr.message ?? ""));
    if (dup) {
      metrics.increment("cleaner_job_lifecycle_idempotency_conflict", { booking_id: bookingId, action });
      void logSystemEvent({
        level: "info",
        source: "cleaner_job_lifecycle",
        message: "job_action_duplicate_idempotency",
        context: { booking_id: bookingId, cleaner_id: session.cleanerId, action, idempotency_key },
      });
      return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
    }
    void logSystemEvent({
      level: "error",
      source: "cleaner_job_lifecycle",
      message: "job_action_failed",
      context: {
        booking_id: bookingId,
        cleaner_id: session.cleanerId,
        action,
        idempotency_key,
        code: claimErr.code,
        message: claimErr.message,
      },
    });
    return NextResponse.json({ error: claimErr.message ?? "Could not claim idempotency key." }, { status: 500 });
  }

  const out = await runCleanerBookingLifecycleAction({
    admin,
    cleanerId: session.cleanerId,
    bookingId,
    action,
  });

  if (out.status !== 200) {
    await admin.from("cleaner_job_lifecycle_idempotency").delete().eq("idempotency_key", idempotency_key);
    void logSystemEvent({
      level: "warn",
      source: "cleaner_job_lifecycle",
      message: "job_action_failed",
      context: {
        booking_id: bookingId,
        cleaner_id: session.cleanerId,
        action,
        idempotency_key,
        http_status: out.status,
        response: out.json,
      },
    });
  } else {
    void logSystemEvent({
      level: "info",
      source: "cleaner_job_lifecycle",
      message: "job_action_success",
      context: { booking_id: bookingId, cleaner_id: session.cleanerId, action, idempotency_key },
    });
  }

  return NextResponse.json(out.json, { status: out.status });
}
