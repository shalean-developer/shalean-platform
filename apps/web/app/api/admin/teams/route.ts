import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth/evaluateAdminAccess";
import { getEffectiveAdminScope } from "@/lib/admin/effectiveAdminScope";
import { clampTeamRosterCapacity, TEAM_MAX_ROSTER_MEMBERS } from "@/lib/dispatch/teamJobsPerDay";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveSupervisorTeamScope } from "@/lib/workforce/supervisorTeamScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AdminAuth = { ok: true; userId: string } | { ok: false; status: number; error: string };
type EarningsTotals = { month_total_cents: number; pending_cents: number; approved_cents: number; processing_cents: number; paid_cents: number };
const emptyEarnings = (): EarningsTotals => ({ month_total_cents: 0, pending_cents: 0, approved_cents: 0, processing_cents: 0, paid_cents: 0 });

async function ensureAdmin(request: Request): Promise<AdminAuth> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return { ok: false, status: 401, error: "Missing authorization." };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { ok: false, status: 503, error: "Server configuration error." };
  const pub = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error } = await pub.auth.getUser(token);
  if (error) return { ok: false, status: 401, error: "Invalid or expired session." };
  const adminAuth = await requireAdminUser(user);
  if (!adminAuth.ok) return { ok: false, status: adminAuth.status, error: adminAuth.error };
  if (!user?.id) return { ok: false, status: 401, error: "Invalid session." };
  return { ok: true, userId: user.id };
}

function activeNow(row: { active_from?: string | null; active_to?: string | null }, nowMs: number): boolean {
  const from = row.active_from ? Date.parse(row.active_from) : Number.NEGATIVE_INFINITY;
  const to = row.active_to ? Date.parse(row.active_to) : Number.POSITIVE_INFINITY;
  return from <= nowMs && to >= nowMs;
}

async function resolveAdminScope(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, userId: string) {
  const { scope, error } = await getEffectiveAdminScope(admin, userId);
  if (error || !scope) throw new Error("Scope resolution unavailable.");
  const scopedSupervisor = scope.roles.includes("supervisor") && !scope.isOwner && !scope.roles.includes("general_manager");
  return { scope, scopedSupervisor };
}

export async function GET(request: Request) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let scopeInfo;
  try { scopeInfo = await resolveAdminScope(admin, auth.userId); }
  catch { return NextResponse.json({ error: "Scope resolution unavailable." }, { status: 503 }); }
  const { scope, scopedSupervisor } = scopeInfo;
  if (scopedSupervisor && scope.teams.length !== 1) {
    return NextResponse.json({ error: "Exactly one team assignment is required for Supervisor team access." }, { status: 503 });
  }

  let teamQuery = admin.from("teams").select("id, name, service_type, capacity_per_day, is_active, created_at, lead_cleaner_id").order("created_at", { ascending: false }).limit(200);
  if (scopedSupervisor) teamQuery = teamQuery.eq("id", scope.teams[0]);
  const { data, error } = await teamQuery;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const teams = data ?? [];
  const ids = teams.map((t) => String((t as { id?: string }).id ?? "").trim()).filter(Boolean);

  const { data: rawMembershipRows, error: memberError } = ids.length
    ? await admin.from("team_members").select("team_id, cleaner_id, active_from, active_to").in("team_id", ids).not("cleaner_id", "is", null)
    : { data: [], error: null };
  if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 });
  const activeMemberships = (rawMembershipRows ?? []).filter((raw) => activeNow(raw as { active_from?: string | null; active_to?: string | null }, Date.now()));
  const countByTeam = new Map<string, number>();
  for (const raw of activeMemberships) {
    const teamId = String((raw as { team_id?: string | null }).team_id ?? "").trim();
    if (teamId) countByTeam.set(teamId, (countByTeam.get(teamId) ?? 0) + 1);
  }
  const teamsWithCounts = teams.map((t) => ({ ...(t as Record<string, unknown>), member_count: countByTeam.get(String((t as { id?: string }).id ?? "")) ?? 0 }));
  if (!scopedSupervisor) return NextResponse.json({ teams: teamsWithCounts, supervisor_view: false });

  const supervisorScope = await resolveSupervisorTeamScope(admin, auth.userId);
  if (!supervisorScope.isSupervisor) return NextResponse.json({ error: "Supervisor team identity could not be resolved." }, { status: 503 });
  const teamId = scope.teams[0];
  const team = teams.find((row) => String((row as { id?: string }).id ?? "") === teamId);
  const leadCleanerId = String((team as { lead_cleaner_id?: string | null } | undefined)?.lead_cleaner_id ?? "").trim();
  const activeTeamCleanerIds = Array.from(new Set(activeMemberships.filter((raw) => String((raw as { team_id?: string | null }).team_id ?? "") === teamId).map((raw) => String((raw as { cleaner_id?: string | null }).cleaner_id ?? "").trim()).filter(Boolean)));
  if (leadCleanerId && !activeTeamCleanerIds.includes(leadCleanerId)) activeTeamCleanerIds.push(leadCleanerId);

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthStartIso = monthStart.toISOString();
  const monthStartYmd = monthStartIso.slice(0, 10);
  const canViewEarnings = scope.permissions.includes("workforce.cleaner_earnings.view");
  const totals = emptyEarnings();
  const earningsByCleaner = new Map<string, EarningsTotals>();

  if (canViewEarnings && activeTeamCleanerIds.length > 0) {
    const [{ data: primaryBookings, error: primaryError }, { data: assignedBookings, error: assignedError }] = await Promise.all([
      admin.from("bookings").select("id").eq("team_id", teamId).gte("date", monthStartYmd),
      admin.from("bookings").select("id").eq("assigned_team_id", teamId).gte("date", monthStartYmd),
    ]);
    if (primaryError) return NextResponse.json({ error: primaryError.message }, { status: 500 });
    if (assignedError) return NextResponse.json({ error: assignedError.message }, { status: 500 });
    const bookingIds = Array.from(new Set([...(primaryBookings ?? []), ...(assignedBookings ?? [])].map((row) => String(row.id))));
    if (bookingIds.length > 0) {
      const { data: earningRows, error: earningError } = await admin.from("cleaner_earnings").select("cleaner_id, booking_id, amount_cents, status").in("cleaner_id", activeTeamCleanerIds).in("booking_id", bookingIds).gte("created_at", monthStartIso);
      if (earningError) return NextResponse.json({ error: earningError.message }, { status: 500 });
      for (const raw of earningRows ?? []) {
        const row = raw as { cleaner_id?: string | null; amount_cents?: number | null; status?: string | null };
        const cleanerId = String(row.cleaner_id ?? "").trim();
        const amount = Number(row.amount_cents ?? 0);
        if (!cleanerId || !Number.isFinite(amount)) continue;
        const item = earningsByCleaner.get(cleanerId) ?? emptyEarnings();
        item.month_total_cents += amount; totals.month_total_cents += amount;
        const status = String(row.status ?? "").toLowerCase();
        if (status === "paid") { item.paid_cents += amount; totals.paid_cents += amount; }
        else if (status === "processing") { item.processing_cents += amount; totals.processing_cents += amount; }
        else if (status === "approved" || status === "eligible") { item.approved_cents += amount; totals.approved_cents += amount; }
        else { item.pending_cents += amount; totals.pending_cents += amount; }
        earningsByCleaner.set(cleanerId, item);
      }
    }
  }

  const { data: cleanerRows, error: cleanerError } = activeTeamCleanerIds.length
    ? await admin.from("cleaners").select("id, full_name, phone, status, is_available, jobs_completed, rating").in("id", activeTeamCleanerIds)
    : { data: [], error: null };
  if (cleanerError) return NextResponse.json({ error: cleanerError.message }, { status: 500 });
  const members = (cleanerRows ?? []).map((raw) => {
    const row = raw as { id: string; full_name?: string | null; phone?: string | null; status?: string | null; is_available?: boolean | null; jobs_completed?: number | null; rating?: number | null };
    return { cleaner_id: row.id, team_id: teamId, name: row.full_name ?? "Cleaner", phone: row.phone ?? null, status: row.status ?? null, is_available: row.is_available ?? null, jobs_completed: row.jobs_completed ?? 0, rating: row.rating ?? null, earnings: earningsByCleaner.get(row.id) ?? emptyEarnings() };
  }).sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ teams: teamsWithCounts, supervisor_view: true, can_view_earnings: canViewEarnings, members, earnings: canViewEarnings ? totals : null, earnings_period_start: monthStartIso }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  try { const { scopedSupervisor } = await resolveAdminScope(admin, auth.userId); if (scopedSupervisor) return NextResponse.json({ error: "Supervisors cannot create teams." }, { status: 403 }); }
  catch { return NextResponse.json({ error: "Scope resolution unavailable." }, { status: 503 }); }
  let body: { name?: string; service_type?: string; capacity_per_day?: number; is_active?: boolean };
  try { body = (await request.json()) as typeof body; } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const name = String(body.name ?? "").trim(); const serviceType = String(body.service_type ?? "").trim();
  const capacityRaw = body.capacity_per_day != null ? Number(body.capacity_per_day) : TEAM_MAX_ROSTER_MEMBERS; const capacity = clampTeamRosterCapacity(capacityRaw);
  if (!name) return NextResponse.json({ error: "name required." }, { status: 400 });
  if (!["deep_cleaning", "move_cleaning"].includes(serviceType)) return NextResponse.json({ error: "service_type must be deep_cleaning or move_cleaning." }, { status: 400 });
  if (body.capacity_per_day != null && (!Number.isFinite(capacityRaw) || capacityRaw <= 0)) return NextResponse.json({ error: "capacity_per_day must be between 2 and 15." }, { status: 400 });
  const { data, error } = await admin.from("teams").insert({ name, service_type: serviceType, capacity_per_day: capacity, is_active: body.is_active !== false }).select("id, name, service_type, capacity_per_day, is_active, created_at").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 }); return NextResponse.json({ ok: true, team: data }, { status: 201 });
}

export async function DELETE(request: Request) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  try { const { scopedSupervisor } = await resolveAdminScope(admin, auth.userId); if (scopedSupervisor) return NextResponse.json({ error: "Supervisors cannot delete teams." }, { status: 403 }); }
  catch { return NextResponse.json({ error: "Scope resolution unavailable." }, { status: 503 }); }
  let body: { teamId?: string }; try { body = (await request.json()) as { teamId?: string }; } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const teamId = String(body.teamId ?? "").trim(); if (!teamId) return NextResponse.json({ error: "teamId required." }, { status: 400 });
  const { count, error: countError } = await admin.from("bookings").select("id", { count: "exact", head: true }).eq("team_id", teamId).eq("is_team_job", true).in("status", ["pending", "assigned", "in_progress"]);
  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 }); if ((count ?? 0) > 0) return NextResponse.json({ error: "Cannot delete team with active bookings." }, { status: 409 });
  const { error } = await admin.from("teams").delete().eq("id", teamId); if (error) return NextResponse.json({ error: error.message }, { status: 500 }); return NextResponse.json({ ok: true });
}
