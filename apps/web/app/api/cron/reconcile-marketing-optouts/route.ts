import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { acquireCronLock, releaseCronLock } from "@/lib/cron/cronLock";
import { CRON_LOCK_KEYS } from "@/lib/cron/cronLockKeys";
import { reconcilePendingMarketingOptOuts } from "@/lib/email/reconcilePendingMarketingOptOuts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Source-only and UNSCHEDULED. Must not be invoked in production before owner approval. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const apiKey = process.env.RESEND_API_KEY;
  const admin = getSupabaseAdmin();
  if (!apiKey || !admin) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const lockAcq = await acquireCronLock(admin, {
    jobName: CRON_LOCK_KEYS.reconcileMarketingOptOuts,
    leaseSeconds: 300,
  });
  if (!lockAcq.ok) return NextResponse.json({ ok: true, skipped: lockAcq.reason });
  // Unlike general cron jobs, an unsubscribe provider-write worker must not
  // fail open if its concurrency protection is unavailable.
  if (lockAcq.degraded) return NextResponse.json({ error: "Reconciliation lock unavailable" }, { status: 503 });
  try {
    const result = await reconcilePendingMarketingOptOuts(admin, apiKey);
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ error: "Reconciliation failed" }, { status: 500 });
  } finally {
    await releaseCronLock(admin, lockAcq.jobName, lockAcq.holderId);
  }
}
