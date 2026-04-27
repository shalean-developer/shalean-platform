import { NextResponse } from "next/server";
import { cleanerHasBookingAccess } from "@/lib/cleaner/cleanerBookingAccess";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { runCleanerBookingLifecycleAction, type CleanerLifecycleAction } from "@/lib/cleaner/runCleanerBookingLifecycleAction";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveDisplayEarnings } from "@/lib/cleaner/displayEarnings";
import { countActiveTeamMembersOnDate } from "@/lib/cleaner/teamMemberAvailability";
import { devOrSampledConsoleLog } from "@/lib/logging/devOrSampledConsole";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOOKING_DETAIL_SELECT =
  "id, service, date, time, location, status, total_paid_zar, total_price, price_breakdown, pricing_version_id, amount_paid_cents, customer_name, customer_phone, extras, assigned_at, en_route_at, started_at, completed_at, created_at, booking_snapshot, is_team_job, team_id, team_member_count_snapshot, cleaner_id, display_earnings_cents, cleaner_payout_cents, payout_id";

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
