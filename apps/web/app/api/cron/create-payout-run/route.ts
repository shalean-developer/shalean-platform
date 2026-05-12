import { NextResponse } from "next/server";
import { withCronLock } from "@/lib/cron/cronLock";
import { CRON_LOCK_KEYS } from "@/lib/cron/cronLockKeys";
import { createPayoutRun } from "@/lib/payout/runs/createPayoutRun";
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

  try {
    /* H-15: serialize payout run creation — duplicate runs would create duplicate payout_runs rows. */
    const lockResult = await withCronLock(
      admin,
      { jobName: CRON_LOCK_KEYS.createPayoutRun, leaseSeconds: 600 },
      () => createPayoutRun(admin),
    );
    if (lockResult.skipped) {
      return NextResponse.json({ ok: true, skipped: true, reason: lockResult.reason });
    }
    return NextResponse.json({ ok: true, run: lockResult.ranIt });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
