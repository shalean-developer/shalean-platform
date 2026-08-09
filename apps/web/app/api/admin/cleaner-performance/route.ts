import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadCleanerPerformanceScorecards } from "@/lib/workforce/cleanerPerformanceScorecards";
import { resolveSupervisorTeamScope } from "@/lib/workforce/supervisorTeamScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: allowed } = await admin.rpc("admin_has_permission", {
    p_user_id: auth.userId,
    p_permission: "cleaner.view",
    p_branch_id: null,
    p_team_id: null,
  });
  if (allowed !== true) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const requestedCleanerId = searchParams.get("cleaner_id")?.trim() || null;
  const rawDays = Number(searchParams.get("days") ?? "90");
  const days = Number.isFinite(rawDays) ? rawDays : 90;

  try {
    const supervisorScope = await resolveSupervisorTeamScope(admin, auth.userId);
    if (supervisorScope.isSupervisor && !supervisorScope.cleanerIds.length) {
      return NextResponse.json({ scorecards: [], meta: { days, scorecardCount: 0, scoped: true, teamIds: [] } });
    }
    if (supervisorScope.isSupervisor && requestedCleanerId && !supervisorScope.cleanerIds.includes(requestedCleanerId)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const result = await loadCleanerPerformanceScorecards(admin, {
      cleanerId: requestedCleanerId,
      cleanerIds: supervisorScope.isSupervisor && !requestedCleanerId ? supervisorScope.cleanerIds : null,
      days,
    });
    return NextResponse.json({
      ...result,
      meta: {
        days: Math.max(30, Math.min(365, Math.round(days))),
        scorecardCount: result.scorecards.length,
        scoped: supervisorScope.isSupervisor,
        teamIds: supervisorScope.isSupervisor ? supervisorScope.teamIds : null,
        sourceOfTruth: {
          roster: "booking_cleaners",
          bookingExecution: "bookings",
          quality: "quality_inspections",
          customerFeedback: "reviews",
          customerCare: "customer_care_cases",
        },
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load cleaner performance." },
      { status: 500 },
    );
  }
}
