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
 * Admin manual trigger for monthly payout generation (catch-up: all unbatched completion months from July 2026).
 *
 * M-18: shares the same H-15 cron lease (`CRON_LOCK_KEYS.generatePayouts`) as
 * `/api/cron/generate-payouts`, so an admin replay cannot race the scheduled
 * cron and produce duplicate `cleaner_payouts` rows. The DB-level partial
 * unique index `cleaner_payouts_unique_active_period_idx`
 * (supabase/migrations/20260945_m18_cleaner_payouts_unique_period.sql) is the
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
      () => generateCatchUpWeeklyPayouts(admin),
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
