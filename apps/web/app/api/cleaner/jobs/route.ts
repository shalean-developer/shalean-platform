import { NextResponse } from "next/server";
import {
  bookingsVisibilityOrFilter,
  fetchCleanerTeamIds,
} from "@/lib/cleaner/cleanerBookingAccess";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveDisplayEarnings } from "@/lib/cleaner/displayEarnings";
import { countActiveTeamMembersOnDate } from "@/lib/cleaner/teamMemberAvailability";
import { devOrSampledConsoleLog } from "@/lib/logging/devOrSampledConsole";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }
  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });

  const { data: c } = await admin.from("cleaners").select("id").eq("id", session.cleanerId).maybeSingle();
  if (!c) {
    return NextResponse.json({ error: "Not a cleaner account." }, { status: 403 });
  }

  const teamIds = await fetchCleanerTeamIds(admin, session.cleanerId);
  const visibilityOr = bookingsVisibilityOrFilter(session.cleanerId, teamIds);

  const { data: jobs, error } = await admin
    .from("bookings")
    .select(
      "id, service, date, time, location, status, total_paid_zar, total_price, price_breakdown, pricing_version_id, amount_paid_cents, customer_name, customer_phone, extras, assigned_at, en_route_at, started_at, completed_at, created_at, booking_snapshot, is_team_job, team_id, team_member_count_snapshot, cleaner_id, display_earnings_cents, cleaner_payout_cents, payout_id",
    )
    .or(visibilityOr)
    .not("status", "eq", "cancelled")
    .not("status", "eq", "failed")
    .not("status", "eq", "pending_payment")
    .order("date", { ascending: true })
    .order("time", { ascending: true })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const mappedJobs = (jobs ?? []).map((raw) => {
    const row = raw as Record<string, unknown>;
    const resolved = resolveDisplayEarnings(
      {
        id: typeof row.id === "string" ? row.id : null,
        is_team_job: row.is_team_job === true,
        display_earnings_cents: typeof row.display_earnings_cents === "number" ? row.display_earnings_cents : null,
        cleaner_payout_cents: typeof row.cleaner_payout_cents === "number" ? row.cleaner_payout_cents : null,
      },
      "api/cleaner/jobs",
    );
    const displayEarningsCents = resolved.cents;
    const displayEarningsIsEstimate = resolved.isEstimate;
    const snapRaw = row.team_member_count_snapshot;
    const teamSnap =
      typeof snapRaw === "number" && Number.isFinite(snapRaw) && snapRaw > 0 ? Math.floor(snapRaw) : null;
    const { cleaner_payout_cents: _legacyPayout, display_earnings_cents: _displayRaw, team_member_count_snapshot: _snapCol, ...safe } = row;
    return {
      ...safe,
      displayEarningsCents,
      displayEarningsIsEstimate,
      __teamSnap: teamSnap as number | null,
    };
  });

  const teamIdsForRoster = [
    ...new Set(
      mappedJobs
        .filter((j) => {
          const rec = j as Record<string, unknown>;
          if (rec.is_team_job !== true || !rec.team_id) return false;
          const dateYmd = String(rec.date ?? "").trim().slice(0, 10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) return false;
          const snap = rec.__teamSnap;
          if (typeof snap === "number" && snap > 0) return false;
          return true;
        })
        .map((j) => String((j as { team_id?: string | null }).team_id ?? "").trim())
        .filter(Boolean),
    ),
  ];

  type MemberRow = {
    team_id?: string | null;
    cleaner_id?: string | null;
    active_from?: string | null;
    active_to?: string | null;
  };

  let membersByTeam: Record<string, MemberRow[]> = {};
  if (teamIdsForRoster.length > 0) {
    const { data: rosterRows, error: rosterErr } = await admin
      .from("team_members")
      .select("team_id, cleaner_id, active_from, active_to")
      .in("team_id", teamIdsForRoster)
      .not("cleaner_id", "is", null);
    if (!rosterErr && rosterRows?.length) {
      for (const raw of rosterRows as MemberRow[]) {
        const tid = String(raw.team_id ?? "").trim();
        if (!tid) continue;
        if (!membersByTeam[tid]) membersByTeam[tid] = [];
        membersByTeam[tid].push(raw);
      }
    }
  }

  const mappedWithTeamCounts = mappedJobs.map((j) => {
    const rec = j as Record<string, unknown>;
    const { __teamSnap, ...pub } = rec;
    const isTeam = pub.is_team_job === true;
    const teamId = String(pub.team_id ?? "").trim();
    const dateYmd = String(pub.date ?? "").trim().slice(0, 10);
    if (!isTeam || !teamId || !/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
      return { ...pub, teamMemberCount: null as number | null };
    }
    const snap = typeof __teamSnap === "number" && __teamSnap > 0 ? __teamSnap : null;
    if (snap != null) {
      return { ...pub, teamMemberCount: snap };
    }
    const roster = membersByTeam[teamId] ?? [];
    const teamMemberCount = countActiveTeamMembersOnDate(roster, dateYmd);
    return { ...pub, teamMemberCount: teamMemberCount > 0 ? teamMemberCount : null };
  });

  const teamVisible = mappedWithTeamCounts.filter((j) => (j as { is_team_job?: boolean }).is_team_job === true);
  if (teamVisible.length > 0) {
    devOrSampledConsoleLog(
      "TEAM_JOB_VISIBLE_TO_CLEANER",
      {
        cleanerId: session.cleanerId,
        jobs: teamVisible.map((x) => ({
          bookingId: String((x as { id?: string }).id ?? ""),
          teamId: (x as { team_id?: string | null }).team_id ?? null,
        })),
      },
      0.02,
    );
  }

  return NextResponse.json({ jobs: mappedWithTeamCounts });
}
