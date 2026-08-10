import { NextResponse } from "next/server";
import { withCronLock } from "@/lib/cron/cronLock";
import { CRON_LOCK_KEYS } from "@/lib/cron/cronLockKeys";
import { generateWeeklyPayouts } from "@/lib/payout/generateWeeklyPayouts";
import {
  prepareDraftRunPayoutsForCatchUp,
  restoreDraftRunPayoutsAfterCatchUp,
} from "@/lib/payout/runs/reconcileDraftRunLateEarnings";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  /* H-15: serialize payout generation across runners — duplicate runs would create duplicate monthly payouts. */
  const lockResult = await withCronLock(
    admin,
    { jobName: CRON_LOCK_KEYS.generatePayouts, leaseSeconds: 900 },
    async () => {
      const prep = await prepareDraftRunPayoutsForCatchUp(admin);
      try {
        const generated = await generateWeeklyPayouts(admin);
        return {
          ...generated,
          lateEarningsReconciledPayouts: prep.payouts.length,
          lateEarningsReconciledRuns: prep.runIds.length,
        };
      } finally {
        await restoreDraftRunPayoutsAfterCatchUp(admin, prep);
      }
    },
  );
  if (lockResult.skipped) {
    return NextResponse.json({ ok: true, skipped: true, reason: lockResult.reason });
  }
  return NextResponse.json({ ok: true, ...lockResult.ranIt });
}
