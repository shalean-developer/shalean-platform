import { NextResponse } from "next/server";
import { cleanerHasBookingAccess } from "@/lib/cleaner/cleanerBookingAccess";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { runCleanerBookingLifecycleAction, type CleanerLifecycleAction } from "@/lib/cleaner/runCleanerBookingLifecycleAction";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveCleanerEarningsCents } from "@/lib/cleaner/resolveCleanerEarnings";
import { countActiveTeamMembersOnDate } from "@/lib/cleaner/teamMemberAvailability";
import {
  isStuckNullEarningsBooking,
  logEligibleOrPaidWithoutFrozen,
  maybeLogStuckNullEarnings,
} from "@/lib/cleaner/cleanerPayoutInvariantLogging";
import { scheduleStuckEarningsRecomputeDebounced } from "@/lib/cleaner/scheduleStuckEarningsRecompute";
import { fetchBookingLineItemsByBookingIds } from "@/lib/cleaner/fetchBookingLineItemsByBookingIds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOOKING_DETAIL_SELECT =
  "id, service, rooms, bathrooms, date, time, location, status, total_paid_zar, total_price, price_breakdown, pricing_version_id, amount_paid_cents, customer_name, customer_phone, extras, assigned_at, en_route_at, started_at, completed_at, created_at, booking_snapshot, is_team_job, team_id, team_member_count_snapshot, cleaner_id, cleaner_response_status, display_earnings_cents, cleaner_earnings_total_cents, cleaner_payout_cents, payout_status, payout_paid_at, payout_frozen_cents";

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
    cleaner_id: (record.cleaner_id as string | null | undefined) ?? null,
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

  return NextResponse.json({
    job: {
      ...safe,
      lineItems: lineItems && lineItems.length > 0 ? lineItems : null,
      displayEarningsCents,
      displayEarningsIsEstimate,
      earnings_cents: displayEarningsCents,
      earnings_estimated: displayEarningsIsEstimate,
      teamMemberCount,
      cleaner_has_issue_report,
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

  let body: { action?: string };
  try {
    body = (await request.json()) as { action?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const action = (typeof body.action === "string" ? body.action.trim() : "") as CleanerLifecycleAction;
  const allowedActions: CleanerLifecycleAction[] = ["accept", "reject", "en_route", "start", "complete"];
  if (!allowedActions.includes(action)) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }
  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });

  const out = await runCleanerBookingLifecycleAction({
    admin,
    cleanerId: session.cleanerId,
    bookingId,
    action,
  });
  return NextResponse.json(out.json, { status: out.status });
}
