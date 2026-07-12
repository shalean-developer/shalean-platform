import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  BOOKING_ROSTER_LOCKED_FORCE_HINT,
  BOOKING_ROSTER_LOCKED_HINT,
  ROSTER_FINALIZED_CODE,
} from "@/lib/admin/bookingRosterLockedMessage";
import { listTeamAssignCandidatesForBooking } from "@/lib/admin/performAdminAssignTeam";
import { adminAssignTeamToBooking } from "@/lib/booking/bookingOperations";
import { isAdmin } from "@/lib/auth/admin";
import { isTeamService } from "@/lib/dispatch/assignBooking";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin(request: Request): Promise<
  | { ok: true; userId: string; email: string | null }
  | { ok: false; status: number; error: string }
> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return { ok: false, status: 401, error: "Missing authorization." };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { ok: false, status: 503, error: "Server configuration error." };

  const pub = createClient(url, anon);
  const {
    data: { user },
  } = await pub.auth.getUser(token);
  if (!user?.id || !user.email || !isAdmin(user.email)) {
    return { ok: false, status: 403, error: "Forbidden." };
  }
  return { ok: true, userId: user.id, email: user.email };
}

function earningsFinalizedAt(raw: unknown): boolean {
  return raw != null && String(raw).trim() !== "";
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = await ctx.params;
  if (!bookingId) return NextResponse.json({ error: "Missing booking id." }, { status: 400 });

  const auth = await requireAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: booking, error: bErr } = await admin
    .from("bookings")
    .select("id, date, service, service_slug, booking_snapshot, is_team_job, cleaner_line_earnings_finalized_at")
    .eq("id", bookingId)
    .maybeSingle();
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  if (
    !isTeamService(
      booking as {
        service?: string | null;
        service_slug?: string | null;
        booking_snapshot?: unknown;
      },
    )
  ) {
    return NextResponse.json({ supports_team_assignment: false, teams: [], earnings_finalized: false });
  }

  const { teams, error, qualified_for_label } = await listTeamAssignCandidatesForBooking(admin, {
    id: booking.id,
    date: booking.date,
    service: booking.service,
    service_slug: booking.service_slug ?? null,
    booking_snapshot: booking.booking_snapshot,
    is_team_job: booking.is_team_job ?? null,
  });
  if (error) return NextResponse.json({ error }, { status: 400 });

  const earningsFinalized = earningsFinalizedAt(
    (booking as { cleaner_line_earnings_finalized_at?: string | null }).cleaner_line_earnings_finalized_at,
  );

  return NextResponse.json({
    supports_team_assignment: true,
    teams,
    qualified_for_label,
    earnings_finalized: earningsFinalized,
  });
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = await ctx.params;
  if (!bookingId) return NextResponse.json({ error: "Missing booking id." }, { status: 400 });

  const auth = await requireAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { teamId?: string; force?: boolean };
  try {
    body = (await request.json()) as { teamId?: string; force?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const teamId = typeof body.teamId === "string" ? body.teamId.trim() : "";
  if (!teamId) return NextResponse.json({ error: "teamId required." }, { status: 400 });
  const force = body.force === true;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const op = await adminAssignTeamToBooking({
    admin,
    bookingId,
    teamId,
    adminUserId: auth.userId,
    adminEmail: auth.email,
    force,
  });

  if (!op.ok) {
    const httpStatus = op.httpStatus ?? 500;
    const cause = op.cause as { code?: string; error?: string } | undefined;
    const code = typeof cause?.code === "string" ? cause.code : undefined;
    const rosterFinalized =
      code === ROSTER_FINALIZED_CODE ||
      (httpStatus === 409 &&
        typeof op.message === "string" &&
        /finalized|roster locked|cleaner line earnings/i.test(op.message));
    return NextResponse.json(
      {
        error: op.message,
        ...(rosterFinalized
          ? {
              hint: BOOKING_ROSTER_LOCKED_HINT,
              force_hint: BOOKING_ROSTER_LOCKED_FORCE_HINT,
              code: ROSTER_FINALIZED_CODE,
            }
          : {}),
        ...(code && !rosterFinalized ? { code } : {}),
      },
      { status: httpStatus },
    );
  }

  const assigned = op.data;
  if (!assigned || !assigned.ok) {
    return NextResponse.json({ error: "Assignment failed." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    teamId: assigned.teamId,
    oldTeamId: assigned.oldTeamId,
    ...(assigned.forceReopenedEarnings ? { forceReopenedEarnings: true } : {}),
  });
}
