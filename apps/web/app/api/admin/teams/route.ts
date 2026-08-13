import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth/evaluateAdminAccess";
import { clampTeamRosterCapacity, TEAM_MAX_ROSTER_MEMBERS } from "@/lib/dispatch/teamJobsPerDay";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveSupervisorTeamScope } from "@/lib/workforce/supervisorTeamScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AdminAuth = { ok: true; userId: string } | { ok: false; status: number; error: string };

async function ensureAdmin(request: Request): Promise<AdminAuth> {
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
  const adminAuth = await requireAdminUser(user);
  if (!adminAuth.ok) return { ok: false, status: adminAuth.status, error: adminAuth.error };
  if (!user?.id) return { ok: false, status: 401, error: "Invalid session." };
  return { ok: true, userId: user.id };
}

export async function GET(request: Request) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let supervisorScope;
  try {
    supervisorScope = await resolveSupervisorTeamScope(admin, auth.userId);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to resolve team scope." }, { status: 500 });
  }

  let teamQuery = admin
    .from("teams")
    .select("id, name, service_type, capacity_per_day, is_active, created_at, lead_cleaner_id")
    .order("created_at", { ascending: false })
    .limit(200);
  if (supervisorScope.isSupervisor) {
    if (!supervisorScope.teamIds.length) {
      return NextResponse.json({
        teams: [],
        supervisor_view: true,
        earnings: { month_total_cents: 0, pending_cents: 0, approved_cents: 0, paid_cents: 0 },
      });
    }
    teamQuery = teamQuery.in("id", supervisorScope.teamIds);
  }

  const { data, error } = await teamQuery;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const teams = data ?? [];
  const ids = teams.map((t) => String((t as { id?: string }).id ?? "").trim()).filter(Boolean);
  const countByTeam = new Map<string, number>();
  if (ids.length > 0) {
    const { data: memberRows, error: mErr } = await admin
      .from("team_members")
      .select("team_id")
      .in("team_id", ids)
      .is("active_to", null)
      .not("cleaner_id", "is", null);
    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
    for (const r of memberRows ?? []) {
      const tid = String((r as { team_id?: string }).team_id ?? "").trim();
      if (!tid) continue;
      countByTeam.set(tid, (countByTeam.get(tid) ?? 0) + 1);
    }
  }
  const teamsWithCounts = teams.map((t) => {
    const id = String((t as { id?: string }).id ?? "").trim();
    return { ...(t as Record<string, unknown>), member_count: countByTeam.get(id) ?? 0 };
  });

  if (!supervisorScope.isSupervisor) {
    return NextResponse.json({ teams: teamsWithCounts, supervisor_view: false });
  }

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const totals = { month_total_cents: 0, pending_cents: 0, approved_cents: 0, paid_cents: 0 };
  if (supervisorScope.cleanerIds.length > 0) {
    const { data: earningRows, error: earningErr } = await admin
      .from("cleaner_earnings")
      .select("amount_cents, status")
      .in("cleaner_id", supervisorScope.cleanerIds)
      .gte("created_at", monthStart);
    if (earningErr) return NextResponse.json({ error: earningErr.message }, { status: 500 });
    for (const raw of earningRows ?? []) {
      const row = raw as { amount_cents?: number | null; status?: string | null };
      const amount = Number(row.amount_cents ?? 0);
      if (!Number.isFinite(amount)) continue;
      totals.month_total_cents += amount;
      const status = String(row.status ?? "").toLowerCase();
      if (status === "paid") totals.paid_cents += amount;
      else if (status === "approved") totals.approved_cents += amount;
      else totals.pending_cents += amount;
    }
  }

  return NextResponse.json({
    teams: teamsWithCounts,
    supervisor_view: true,
    earnings: totals,
    earnings_period_start: monthStart,
  });
}

export async function POST(request: Request) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  const supervisorScope = await resolveSupervisorTeamScope(admin, auth.userId);
  if (supervisorScope.isSupervisor) {
    return NextResponse.json({ error: "Supervisors cannot create teams." }, { status: 403 });
  }

  let body: { name?: string; service_type?: string; capacity_per_day?: number; is_active?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const name = String(body.name ?? "").trim();
  const serviceType = String(body.service_type ?? "").trim();
  const capacityRaw = body.capacity_per_day != null ? Number(body.capacity_per_day) : TEAM_MAX_ROSTER_MEMBERS;
  const capacity = clampTeamRosterCapacity(capacityRaw);
  if (!name) return NextResponse.json({ error: "name required." }, { status: 400 });
  if (!["deep_cleaning", "move_cleaning"].includes(serviceType)) {
    return NextResponse.json({ error: "service_type must be deep_cleaning or move_cleaning." }, { status: 400 });
  }
  if (body.capacity_per_day != null && (!Number.isFinite(capacityRaw) || capacityRaw <= 0)) {
    return NextResponse.json({ error: "capacity_per_day must be between 2 and 15." }, { status: 400 });
  }

  const { data, error } = await admin
    .from("teams")
    .insert({ name, service_type: serviceType, capacity_per_day: capacity, is_active: body.is_active !== false })
    .select("id, name, service_type, capacity_per_day, is_active, created_at")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, team: data }, { status: 201 });
}

export async function DELETE(request: Request) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  const supervisorScope = await resolveSupervisorTeamScope(admin, auth.userId);
  if (supervisorScope.isSupervisor) {
    return NextResponse.json({ error: "Supervisors cannot delete teams." }, { status: 403 });
  }

  let body: { teamId?: string };
  try {
    body = (await request.json()) as { teamId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const teamId = String(body.teamId ?? "").trim();
  if (!teamId) return NextResponse.json({ error: "teamId required." }, { status: 400 });

  const { count, error: countErr } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId)
    .eq("is_team_job", true)
    .in("status", ["pending", "assigned", "in_progress"]);
  if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: "Cannot delete team with active bookings." }, { status: 409 });
  }

  const { error } = await admin.from("teams").delete().eq("id", teamId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
