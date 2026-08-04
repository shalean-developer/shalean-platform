import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getEffectiveAdminScope } from "@/lib/admin/effectiveAdminScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPORTING_LOOKBACK_DAYS = 30;
const UPCOMING_WINDOW_DAYS = 30;

function bearerToken(request: Request): string {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
}

function ymdJohannesburg(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function activeOnDate(
  row: { active_from?: string | null; active_to?: string | null },
  ymd: string,
): boolean {
  const dayStart = Date.parse(`${ymd}T00:00:00+02:00`);
  const dayEnd = Date.parse(`${ymd}T23:59:59.999+02:00`);
  const activeFrom = row.active_from ? Date.parse(row.active_from) : Number.NEGATIVE_INFINITY;
  const activeTo = row.active_to ? Date.parse(row.active_to) : Number.POSITIVE_INFINITY;
  return activeFrom <= dayEnd && activeTo >= dayStart;
}

export async function GET(request: Request) {
  const token = bearerToken(request);
  if (!token) return NextResponse.json({ error: "Missing authorization." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !serviceRole) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const publicClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const {
    data: { user },
    error: userError,
  } = await publicClient.auth.getUser(token);
  if (userError || !user?.id) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }

  const { scope, error: scopeError } = await getEffectiveAdminScope(admin, user.id);
  if (scopeError || !scope) {
    return NextResponse.json({ error: "Scope resolution unavailable." }, { status: 503 });
  }
  if (!scope.permissions.includes("team.view") && !scope.permissions.includes("cleaner.view")) {
    return NextResponse.json({ error: "Access restricted." }, { status: 403 });
  }

  const isSupervisor = scope.roles.includes("supervisor");
  if (isSupervisor && scope.teams.length !== 1) {
    return NextResponse.json(
      { error: "Exactly one team assignment is required for Supervisor performance access." },
      { status: 503 },
    );
  }

  const teamIds = isSupervisor ? scope.teams : [];
  let teamsQuery = admin.from("teams").select("id,name,lead_cleaner_id,is_active").eq("is_active", true);
  if (teamIds.length > 0) teamsQuery = teamsQuery.in("id", teamIds);
  const { data: teams, error: teamsError } = await teamsQuery.order("name");
  if (teamsError) return NextResponse.json({ error: teamsError.message }, { status: 500 });

  const resolvedTeamIds = (teams ?? []).map((team) => String(team.id));
  const leadIds = (teams ?? [])
    .map((team) => team.lead_cleaner_id)
    .filter((id): id is string => typeof id === "string");

  const [leadResult, membershipResult] = await Promise.all([
    leadIds.length
      ? admin.from("cleaners").select("id,full_name").in("id", leadIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null }>, error: null }),
    resolvedTeamIds.length
      ? admin.from("team_members").select("team_id,cleaner_id,active_from,active_to").in("team_id", resolvedTeamIds)
      : Promise.resolve({
          data: [] as Array<{
            team_id: string;
            cleaner_id: string;
            active_from: string | null;
            active_to: string | null;
          }>,
          error: null,
        }),
  ]);
  if (leadResult.error) return NextResponse.json({ error: leadResult.error.message }, { status: 500 });
  if (membershipResult.error) {
    return NextResponse.json({ error: membershipResult.error.message }, { status: 500 });
  }

  const today = ymdJohannesburg();
  const historyFromYmd = ymdJohannesburg(addDays(new Date(), -REPORTING_LOOKBACK_DAYS));
  const futureYmd = ymdJohannesburg(addDays(new Date(), UPCOMING_WINDOW_DAYS));
  const activeMemberships = (membershipResult.data ?? []).filter((row) => activeOnDate(row, today));

  let bookingsQuery = admin
    .from("bookings")
    .select("id,team_id,date,status,completed_at,started_at,time")
    .gte("date", historyFromYmd)
    .lte("date", futureYmd);
  if (resolvedTeamIds.length > 0) bookingsQuery = bookingsQuery.in("team_id", resolvedTeamIds);
  else if (isSupervisor) {
    bookingsQuery = bookingsQuery.eq("team_id", "00000000-0000-0000-0000-000000000000");
  }

  const { data: bookings, error: bookingsError } = await bookingsQuery;
  if (bookingsError) return NextResponse.json({ error: bookingsError.message }, { status: 500 });

  const cleanerIds = Array.from(new Set(activeMemberships.map((row) => String(row.cleaner_id))));
  const canViewEarnings = scope.permissions.includes("workforce.cleaner_earnings.view");
  let earnings: Array<Record<string, unknown>> = [];
  if (canViewEarnings && cleanerIds.length > 0) {
    const { data, error } = await admin
      .from("cleaner_earnings")
      .select("cleaner_id,amount_cents,status")
      .in("cleaner_id", cleanerIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    earnings = (data ?? []) as Array<Record<string, unknown>>;
  }

  const leadMap = new Map(
    (leadResult.data ?? []).map((lead) => [String(lead.id), lead.full_name ?? "Unassigned"]),
  );
  const memberCount = new Map<string, number>();
  for (const row of activeMemberships) {
    memberCount.set(String(row.team_id), (memberCount.get(String(row.team_id)) ?? 0) + 1);
  }

  const rows = (teams ?? []).map((team) => {
    const id = String(team.id);
    const teamBookings = (bookings ?? []).filter((booking) => String(booking.team_id ?? "") === id);
    const todayBookings = teamBookings.filter((booking) => booking.date === today);
    const upcoming = teamBookings.filter(
      (booking) => typeof booking.date === "string" && booking.date > today && booking.date <= futureYmd,
    );
    const completed = teamBookings.filter(
      (booking) =>
        booking.status === "completed" &&
        typeof booking.date === "string" &&
        booking.date >= historyFromYmd &&
        booking.date <= today,
    );
    const inProgress = teamBookings.filter(
      (booking) => booking.date === today && booking.status === "in_progress",
    );
    const pending = teamBookings.filter(
      (booking) =>
        typeof booking.date === "string" &&
        booking.date >= today &&
        ["pending", "confirmed", "assigned"].includes(String(booking.status ?? "")),
    );
    return {
      teamId: id,
      teamName: String(team.name ?? "Unnamed team"),
      supervisorName: team.lead_cleaner_id
        ? leadMap.get(String(team.lead_cleaner_id)) ?? "Unassigned"
        : "Unassigned",
      memberCount: memberCount.get(id) ?? 0,
      todayBookings: todayBookings.length,
      upcomingBookings: upcoming.length,
      completedBookings: completed.length,
      inProgressBookings: inProgress.length,
      pendingBookings: pending.length,
    };
  });

  const pendingEarningsCents = earnings
    .filter((row) => String(row.status ?? "") === "pending")
    .reduce((sum, row) => sum + numberValue(row.amount_cents), 0);
  const eligibleEarningsCents = earnings
    .filter((row) => String(row.status ?? "") === "eligible")
    .reduce((sum, row) => sum + numberValue(row.amount_cents), 0);

  return NextResponse.json(
    {
      scoped: isSupervisor,
      generatedAt: new Date().toISOString(),
      reportingWindow: {
        completedFrom: historyFromYmd,
        completedTo: today,
        upcomingFrom: today,
        upcomingTo: futureYmd,
      },
      teams: rows,
      totals: {
        teams: rows.length,
        members: rows.reduce((sum, row) => sum + row.memberCount, 0),
        todayBookings: rows.reduce((sum, row) => sum + row.todayBookings, 0),
        upcomingBookings: rows.reduce((sum, row) => sum + row.upcomingBookings, 0),
        completedBookings: rows.reduce((sum, row) => sum + row.completedBookings, 0),
        pendingEarningsCents: canViewEarnings ? pendingEarningsCents : null,
        eligibleEarningsCents: canViewEarnings ? eligibleEarningsCents : null,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
