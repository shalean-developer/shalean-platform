import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { backfillCompletedMissingDisplayEarnings } from "@/lib/payout/backfillCompletedMissingDisplayEarnings";
import { resolvePersistCleanerIdForBooking } from "@/lib/payout/bookingEarningsIntegrity";
import { repairCompletedStuckZeroDisplayFromSignals } from "@/lib/payout/repairCompletedStuckZeroDisplayFromSignals";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MissingPayoutRow = {
  id: string;
  cleaner_id: string | null;
  payout_owner_cleaner_id?: string | null;
  is_team_job?: boolean | null;
};

type UnresolvedMissingPayoutRow = MissingPayoutRow & {
  total_paid_cents?: number | null;
  amount_paid_cents?: number | null;
  total_paid_zar?: number | null;
  base_amount_cents?: number | null;
  service?: string | null;
};

async function getMissingPayoutStatus(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>) {
  const { count } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("status", "completed")
    .eq("is_test", false)
    .is("display_earnings_cents", null);

  const { data: unresolvedRows } = await admin
    .from("bookings")
    .select("id, cleaner_id, payout_owner_cleaner_id, is_team_job, total_paid_cents, amount_paid_cents, total_paid_zar, base_amount_cents, service")
    .eq("status", "completed")
    .eq("is_test", false)
    .is("display_earnings_cents", null)
    .limit(20);

  const unresolved = ((unresolvedRows ?? []) as UnresolvedMissingPayoutRow[]).map((row) => {
    const persistId = resolvePersistCleanerIdForBooking(row);
    const hasAmount =
      Number(row.total_paid_cents ?? row.amount_paid_cents ?? 0) > 0 ||
      (row.total_paid_zar != null && Number(row.total_paid_zar) > 0);
    const reason = !persistId ? "missing_cleaner_or_payout_owner" : !hasAmount ? "missing_paid_amount" : "persist_failed_or_skipped";
    return {
      bookingId: row.id,
      cleanerId: persistId,
      reason,
      totalPaidCents: row.total_paid_cents ?? row.amount_paid_cents ?? null,
      totalPaidZar: row.total_paid_zar ?? null,
      baseAmountCents: row.base_amount_cents ?? null,
      service: row.service ?? null,
    };
  });

  return { remaining: count ?? 0, unresolved };
}

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const status = await getMissingPayoutStatus(admin);
  return NextResponse.json({ ok: true, ...status });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const backfill = await backfillCompletedMissingDisplayEarnings(admin, 1000);
  if (!backfill.ok) {
    return NextResponse.json({ error: backfill.error }, { status: 500 });
  }

  const stuckZeroRepair = await repairCompletedStuckZeroDisplayFromSignals(admin, 1000);

  const { remaining, unresolved } = await getMissingPayoutStatus(admin);

  const anyFailure = backfill.failed > 0 || !stuckZeroRepair.ok || stuckZeroRepair.failed > 0;

  void logSystemEvent({
    level: anyFailure ? "warn" : "info",
    source: "PAYOUT_BACKFILL_MISSING",
    message: "Completed booking payout backfill run",
    context: {
      fixed: backfill.fixed,
      skipped: backfill.skipped,
      failedCount: backfill.failed,
      stuck_zero_display_repair: stuckZeroRepair,
      remaining,
      unresolved,
      actor: auth.userId,
    },
  });

  return NextResponse.json({
    ok: !anyFailure,
    fixed: backfill.fixed,
    skipped: backfill.skipped,
    failed: backfill.failed,
    stuck_zero_display_repair: stuckZeroRepair,
    remaining,
    unresolved,
  });
}
