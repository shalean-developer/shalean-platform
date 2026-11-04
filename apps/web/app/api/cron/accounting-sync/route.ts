import { NextResponse } from "next/server";
import { withCronLock } from "@/lib/cron/cronLock";
import { CRON_LOCK_KEYS } from "@/lib/cron/cronLockKeys";
import { processAccountingSyncQueue } from "@/lib/accounting/processAccountingSyncQueue";
import { isZohoBooksWriteBlocked } from "@/lib/zoho/zohoWriteIsolation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Reject staging accounting jobs before acquiring a DB cron lock.
  if (isZohoBooksWriteBlocked(process.env.SHALEAN_APP_ENV)) {
    return NextResponse.json({ error: "zoho_accounting_sync_blocked_nonproduction" }, { status: 409 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const lockResult = await withCronLock(
    admin,
    { jobName: CRON_LOCK_KEYS.accountingSync, leaseSeconds: 600 },
    async () => processAccountingSyncQueue(admin, 10, 0),
  );

  if (lockResult.skipped) {
    return NextResponse.json({ ok: true, skipped: true, reason: lockResult.reason });
  }
  return NextResponse.json({ ok: true, ...lockResult.ranIt });
}
