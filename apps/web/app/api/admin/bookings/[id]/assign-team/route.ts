import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { listTeamAssignCandidatesForBooking, performAdminAssignTeam } from "@/lib/admin/performAdminAssignTeam";
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

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = await ctx.params;
  if (!bookingId) return NextResponse.json({ error: "Missing booking id." }, { status: 400 });

  const auth = await requireAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: booking, error: bErr } = await admin
    .from("bookings")
    .select("id, date, service, booking_snapshot")
    .eq("id", bookingId)
    .maybeSingle();
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  if (!isTeamService(booking as { service?: string | null; booking_snapshot?: unknown })) {
    return NextResponse.json({ supports_team_assignment: false, teams: [] });
  }

  const { teams, error } = await listTeamAssignCandidatesForBooking(
    admin,
    booking as { id: string; date: string | null; service: string | null; booking_snapshot?: unknown },
  );
  if (error) return NextResponse.json({ error }, { status: 400 });

  return NextResponse.json({ supports_team_assignment: true, teams });
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = await ctx.params;
  if (!bookingId) return NextResponse.json({ error: "Missing booking id." }, { status: 400 });

  const auth = await requireAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { teamId?: string };
  try {
    body = (await request.json()) as { teamId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const teamId = typeof body.teamId === "string" ? body.teamId.trim() : "";
  if (!teamId) return NextResponse.json({ error: "teamId required." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const result = await performAdminAssignTeam({
    admin,
    bookingId,
    teamId,
    adminUserId: auth.userId,
    adminEmail: auth.email,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.httpStatus });
  }

  return NextResponse.json({
    ok: true,
    teamId: result.teamId,
    oldTeamId: result.oldTeamId,
  });
}
