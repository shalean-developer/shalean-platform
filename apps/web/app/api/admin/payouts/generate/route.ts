import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { withCronLock } from "@/lib/cron/cronLock";
import { CRON_LOCK_KEYS } from "@/lib/cron/cronLockKeys";
import { PayoutGenerationBlockedError } from "@/lib/payout/backfillLegacyWeeklyPayoutColumns";
import { generateCatchUpWeeklyPayouts } from "@/lib/payout/generateWeeklyPayouts";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin manual trigger for the canonical monthly cleaner payout cycle.
 *
 * Generates every closed Johannesburg calendar month that still has unlinked
 * payable cleaner earnings. Current-month rows are excluded by the catch-up
 * period guard, so active earnings and monthly customer invoices keep accruing
 * without creating an early payout batch.
 *
 * Late-earnings reconciliation: a frozen cleaner payout may receive newly
 * eligible earnings only while its parent payout run is still DRAFT. The
 * canonical payout stays frozen and attached to its run; payout and draft-run
 * totals are recomputed in place. Approved/paid runs remain immutable.
 *
 * M-18: shares the same H-15 cron lease (`CRON_LOCK_KEYS.generatePayouts`) as
 * `/api/cron/generate-payouts`, so an admin replay cannot race the scheduled
 * cron and produce duplicate `cleaner_payouts` rows. The DB-level partial
 * unique index `cleaner_payouts_unique_active_period_idx` remains the
 * defense-in-depth fence if the lock RPC is unavailable.
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  try {
    const lockResult = await withCronLock(
      admin,
      { jobName: CRON_LOCK_KEYS.generatePayouts, leaseSeconds: 900 },
      async () => {
        const generated = await generateCatchUpWeeklyPayouts(admin, { createdBy: auth.userId });
        return {
          ...generated,
          payoutFrequency: "monthly" as const,
          closedPeriodOnly: true,
        };
      },
    );
    if (lockResult.skipped) {
      return NextResponse.json({ ok: true, skipped: true, reason: lockResult.reason });
    }
    return NextResponse.json({ ok: true, ...lockResult.ranIt });
  } catch (e) {
    if (e instanceof PayoutGenerationBlockedError) {
      return NextResponse.json(
        {
          error: e.message,
          remaining: e.remaining,
          bookingIds: e.bookingIds,
        },
        { status: 409 },
      );
    }
    throw e;
  }
}
