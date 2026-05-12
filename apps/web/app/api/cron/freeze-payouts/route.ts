import { NextResponse } from "next/server";
import { withCronLock } from "@/lib/cron/cronLock";
import { CRON_LOCK_KEYS } from "@/lib/cron/cronLockKeys";
import { freezeEligiblePayouts } from "@/lib/payout/runs/freezeEligiblePayouts";
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

  /* H-15: serialize freeze-payouts — duplicate runs could double-snapshot frozen amounts. */
  const lockResult = await withCronLock(
    admin,
    { jobName: CRON_LOCK_KEYS.freezePayouts, leaseSeconds: 600 },
    () => freezeEligiblePayouts(admin),
  );
  if (lockResult.skipped) {
    return NextResponse.json({ ok: true, skipped: true, reason: lockResult.reason });
  }
  return NextResponse.json({ ok: true, ...lockResult.ranIt });
}
