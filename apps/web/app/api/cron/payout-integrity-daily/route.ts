import { NextResponse } from "next/server";

import { logSystemEvent } from "@/lib/logging/systemLog";
import { backfillCompletedMissingDisplayEarnings } from "@/lib/payout/backfillCompletedMissingDisplayEarnings";
import { repairCompletedStuckZeroDisplayFromSignals } from "@/lib/payout/repairCompletedStuckZeroDisplayFromSignals";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily snapshot of payout-adjacent integrity signals (query DB truth, not `[metric]` logs).
 *
 * Vercel Cron: `Authorization: Bearer CRON_SECRET`.
 * Suggested schedule: daily — POST /api/cron/payout-integrity-daily
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const [
    { count: paidMissingPaidAt, error: e1 },
    { count: totalPaidRows, error: e1b },
    { count: eligibleMissingFrozen, error: e2 },
    { count: totalEligibleRows, error: e2b },
    { count: teamJobMissingPayoutOwner, error: e3 },
    { count: totalTeamJobs, error: e3b },
    { count: completedMissingDisplayEarnings, error: e4 },
    { count: totalCompletedRows, error: e4b },
  ] = await Promise.all([
    admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("payout_status", "paid")
      .is("payout_paid_at", null),
    admin.from("bookings").select("id", { count: "exact", head: true }).eq("payout_status", "paid"),
    admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("payout_status", "eligible")
      .is("payout_frozen_cents", null),
    admin.from("bookings").select("id", { count: "exact", head: true }).eq("payout_status", "eligible"),
    admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("is_team_job", true)
      .is("payout_owner_cleaner_id", null),
    admin.from("bookings").select("id", { count: "exact", head: true }).eq("is_team_job", true),
    admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed")
      .is("display_earnings_cents", null),
    admin.from("bookings").select("id", { count: "exact", head: true }).eq("status", "completed"),
  ]);

  if (e1 || e1b || e2 || e2b || e3 || e3b || e4 || e4b) {
    return NextResponse.json(
      {
        error:
          e1?.message ??
          e1b?.message ??
          e2?.message ??
          e2b?.message ??
          e3?.message ??
          e3b?.message ??
          e4?.message ??
          e4b?.message ??
          "Count failed.",
      },
      { status: 500 },
    );
  }

  const paidBad = paidMissingPaidAt ?? 0;
  const paidTotal = totalPaidRows ?? 0;
  const eligBad = eligibleMissingFrozen ?? 0;
  const eligTotal = totalEligibleRows ?? 0;
  const teamBad = teamJobMissingPayoutOwner ?? 0;
  const teamTotal = totalTeamJobs ?? 0;
  const completedMissingDisplay = completedMissingDisplayEarnings ?? 0;
  const completedTotal = totalCompletedRows ?? 0;

  /** Percent of cohort (0–100, four decimal places). */
  const pct = (bad: number, tot: number): number | null =>
    tot > 0 ? Math.round((bad / tot) * 100 * 10_000) / 10_000 : null;

  const ratioLine = (label: string, p: number | null, bad: number, tot: number): string => {
    if (p == null) return `${label}: —`;
    return `${label}: ${p}% (${bad.toLocaleString("en-US")} / ${tot.toLocaleString("en-US")})`;
  };

  const pPaid = pct(paidBad, paidTotal);
  const pElig = pct(eligBad, eligTotal);
  const pTeam = pct(teamBad, teamTotal);
  const pCompletedDisplay = pct(completedMissingDisplay, completedTotal);

  const payload = {
    as_of: new Date().toISOString(),
    paid_rows_missing_payout_paid_at: paidBad,
    total_paid_rows: paidTotal,
    invalid_paid_ratio_pct: pPaid,
    invalid_paid_ratio_display: ratioLine("Invalid paid", pPaid, paidBad, paidTotal),
    eligible_rows_missing_payout_frozen_cents: eligBad,
    total_eligible_rows: eligTotal,
    eligible_missing_frozen_ratio_pct: pElig,
    eligible_missing_frozen_ratio_display: ratioLine("Eligible missing frozen", pElig, eligBad, eligTotal),
    team_jobs_missing_payout_owner: teamBad,
    total_team_jobs: teamTotal,
    team_missing_owner_ratio_pct: pTeam,
    team_missing_owner_ratio_display: ratioLine("Team missing owner", pTeam, teamBad, teamTotal),
    completed_rows_missing_display_earnings_cents: completedMissingDisplay,
    total_completed_rows: completedTotal,
    completed_missing_display_ratio_pct: pCompletedDisplay,
    completed_missing_display_ratio_display: ratioLine("Completed missing display earnings", pCompletedDisplay, completedMissingDisplay, completedTotal),
  };

  let autoRecovery: { attempted: boolean; fixed?: number; skipped?: number; failed?: number; error?: string } = {
    attempted: false,
  };
  if (completedMissingDisplay > 0) {
    const bf = await backfillCompletedMissingDisplayEarnings(admin, 80);
    autoRecovery = bf.ok
      ? { attempted: true, fixed: bf.fixed, skipped: bf.skipped, failed: bf.failed }
      : { attempted: true, error: bf.error };
  }

  const stuckZeroRepair = await repairCompletedStuckZeroDisplayFromSignals(admin, 150);
  const stuckZeroRepairError = stuckZeroRepair.ok ? null : stuckZeroRepair.error;

  const integrityLevel =
    completedMissingDisplay > 0 || stuckZeroRepairError ? "error" : "info";
  void logSystemEvent({
    level: integrityLevel,
    source: "cron/payout-integrity-daily",
    message: "payout_integrity_daily_snapshot",
    context: {
      ...payload,
      auto_recovery_completed_missing_display: autoRecovery,
      auto_recovery_stuck_zero_display_from_signals: stuckZeroRepair,
      summary_lines: [
        payload.invalid_paid_ratio_display,
        payload.eligible_missing_frozen_ratio_display,
        payload.team_missing_owner_ratio_display,
        payload.completed_missing_display_ratio_display,
      ],
    },
  });

  return NextResponse.json({
    ok: true,
    ...payload,
    auto_recovery_completed_missing_display: autoRecovery,
    auto_recovery_stuck_zero_display_from_signals: stuckZeroRepair,
  });
}
