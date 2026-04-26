import { NextResponse } from "next/server";
import { cleanerHasBookingAccess } from "@/lib/cleaner/cleanerBookingAccess";
import { ensureBookingAssignment } from "@/lib/dispatch/ensureBookingAssignment";
import { notifyBookingEvent } from "@/lib/notifications/notifyBookingEvent";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { syncCleanerBusyFromBookings } from "@/lib/cleaner/syncCleanerStatus";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { BOOKING_PAYOUT_COLUMNS_CLEAR } from "@/lib/payout/bookingPayoutColumns";
import { persistCleanerPayoutIfUnset } from "@/lib/payout/persistCleanerPayout";
import { resolveDisplayEarnings } from "@/lib/cleaner/displayEarnings";
import { countActiveTeamMembersOnDate } from "@/lib/cleaner/teamMemberAvailability";
import { devOrSampledConsoleLog } from "@/lib/logging/devOrSampledConsole";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOOKING_DETAIL_SELECT =
  "id, service, date, time, location, status, total_paid_zar, total_price, price_breakdown, pricing_version_id, amount_paid_cents, customer_name, customer_phone, extras, assigned_at, en_route_at, started_at, completed_at, created_at, booking_snapshot, is_team_job, team_id, team_member_count_snapshot, cleaner_id, display_earnings_cents, cleaner_payout_cents, payout_id";

type Action = "accept" | "reject" | "en_route" | "start" | "complete";

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

  if (record.is_team_job === true && String(record.cleaner_id ?? "").trim() !== session.cleanerId) {
    devOrSampledConsoleLog(
      "TEAM_JOB_VISIBLE_TO_CLEANER",
      {
        bookingId,
        teamId: record.team_id ?? null,
        cleanerId: session.cleanerId,
      },
      0.02,
    );
  }
  const resolved = resolveDisplayEarnings(
    {
      id: typeof record.id === "string" ? record.id : null,
      is_team_job: record.is_team_job === true,
      display_earnings_cents: typeof record.display_earnings_cents === "number" ? record.display_earnings_cents : null,
      cleaner_payout_cents: typeof record.cleaner_payout_cents === "number" ? record.cleaner_payout_cents : null,
    },
    "api/cleaner/jobs/[id]",
  );
  const displayEarningsCents = resolved.cents;
  const displayEarningsIsEstimate = resolved.isEstimate;
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

  return NextResponse.json({
    job: { ...safe, displayEarningsCents, displayEarningsIsEstimate, teamMemberCount },
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

  const action = (typeof body.action === "string" ? body.action.trim() : "") as Action;
  const allowedActions: Action[] = ["accept", "reject", "en_route", "start", "complete"];
  if (!allowedActions.includes(action)) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }
  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });
  const cleanerId = session.cleanerId;

  const { data: booking, error: bErr } = await admin
    .from("bookings")
    .select("id, cleaner_id, team_id, is_team_job, status, assignment_attempts")
    .eq("id", bookingId)
    .maybeSingle();

  if (bErr || !booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  const bRow = booking as {
    cleaner_id?: string | null;
    team_id?: string | null;
    is_team_job?: boolean | null;
    status?: string | null;
    assignment_attempts?: number | null;
  };
  const canAccess = await cleanerHasBookingAccess(admin, cleanerId, {
    cleaner_id: bRow.cleaner_id ?? null,
    team_id: bRow.team_id ?? null,
    is_team_job: bRow.is_team_job === true,
  });
  if (!canAccess) {
    return NextResponse.json({ error: "Not your job." }, { status: 403 });
  }

  const isTeamJob = bRow.is_team_job === true;

  if (isTeamJob && action === "reject") {
    return NextResponse.json(
      { error: "Team jobs cannot be declined from the app. Contact support if you cannot make this booking." },
      { status: 400 },
    );
  }

  const st = String(bRow.status ?? "").toLowerCase();
  const now = new Date().toISOString();

  if (action === "accept") {
    if (st !== "assigned") {
      return NextResponse.json({ error: "Job is not in assigned state." }, { status: 400 });
    }
    await syncCleanerBusyFromBookings(admin, cleanerId);
    return NextResponse.json({ ok: true, status: "assigned" });
  }

  if (action === "reject") {
    if (st !== "assigned") {
      return NextResponse.json({ error: "You can only reject before starting the job." }, { status: 400 });
    }
    const attempts = Number(bRow.assignment_attempts ?? 0);
    const { error: uErr } = await admin
      .from("bookings")
      .update({
        cleaner_id: null,
        status: "pending",
        assigned_at: null,
        en_route_at: null,
        started_at: null,
        assignment_attempts: attempts + 1,
        ...BOOKING_PAYOUT_COLUMNS_CLEAR,
      })
      .eq("id", bookingId);

    if (uErr) {
      return NextResponse.json({ error: uErr.message }, { status: 500 });
    }

    await syncCleanerBusyFromBookings(admin, cleanerId);

    const auto = process.env.AUTO_DISPATCH_CLEANERS !== "false";
    if (auto) {
      const r = await ensureBookingAssignment(admin, bookingId, {
        source: "cleaner_job_reject",
        smartAssign: { excludeCleanerIds: [cleanerId] },
      });
      if (!r.ok) {
        await reportOperationalIssue("warn", "cleaner/reject", "Re-dispatch failed", {
          bookingId,
          reason: r.error,
        });
      }
    }

    return NextResponse.json({ ok: true, status: "pending", reassigned: auto });
  }

  if (action === "en_route") {
    if (st !== "assigned" && st !== "in_progress") {
      return NextResponse.json({ error: "Invalid state for en_route." }, { status: 400 });
    }
    const { error: uErr } = await admin.from("bookings").update({ en_route_at: now }).eq("id", bookingId);
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: st });
  }

  if (action === "start") {
    if (st !== "assigned") {
      return NextResponse.json({ error: "Start requires assigned state." }, { status: 400 });
    }
    const { error: uErr } = await admin
      .from("bookings")
      .update({ status: "in_progress", started_at: now })
      .eq("id", bookingId);
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });
    await syncCleanerBusyFromBookings(admin, cleanerId);
    return NextResponse.json({ ok: true, status: "in_progress" });
  }

  if (action === "complete") {
    if (st !== "in_progress") {
      return NextResponse.json({ error: "Mark the job as started before completing." }, { status: 400 });
    }
    const { error: uErr } = await admin
      .from("bookings")
      .update({ status: "completed", completed_at: now })
      .eq("id", bookingId);

    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

    try {
      const payout = await persistCleanerPayoutIfUnset({ admin, bookingId, cleanerId });
      if (!payout.ok) {
        await reportOperationalIssue("error", "cleaner/jobs/complete", `payout missing after completion: ${payout.error}`, {
          bookingId,
          cleanerId,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("cleaner/jobs/complete persistCleanerPayoutIfUnset", { bookingId, cleanerId, error: msg });
      await reportOperationalIssue("error", "cleaner/jobs/complete", `payout persist threw after completion: ${msg}`, {
        bookingId,
        cleanerId,
      });
    }

    void notifyBookingEvent({ type: "completed", supabase: admin, bookingId });

    const { data: cj } = await admin.from("cleaners").select("jobs_completed").eq("id", cleanerId).maybeSingle();
    const prev = cj && typeof cj === "object" ? Number((cj as { jobs_completed?: number }).jobs_completed ?? 0) : 0;
    await admin.from("cleaners").update({ jobs_completed: prev + 1 }).eq("id", cleanerId);

    await syncCleanerBusyFromBookings(admin, cleanerId);
    return NextResponse.json({ ok: true, status: "completed" });
  }

  return NextResponse.json({ error: "Unsupported." }, { status: 400 });
}
