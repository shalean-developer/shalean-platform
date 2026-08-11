import { NextResponse } from "next/server";
import { acquireCronLock, releaseCronLock } from "@/lib/cron/cronLock";
import { CRON_LOCK_KEYS } from "@/lib/cron/cronLockKeys";
import { reconcilePaystackSettlements } from "@/lib/payments/reconcilePaystackSettlements";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = String(process.env.CRON_SECRET ?? "").trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const lockAcq = await acquireCronLock(admin, {
    jobName: CRON_LOCK_KEYS.reconcilePaystackSettlements,
    leaseSeconds: 1800,
  });
  if (!lockAcq.ok) {
    return NextResponse.json({ ok: true, skipped: true, reason: lockAcq.reason });
  }

  try {
    const result = await reconcilePaystackSettlements(admin);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Paystack settlement reconciliation failed.";
    console.error("[cron/reconcile-paystack-settlements]", message, e);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await releaseCronLock(admin, lockAcq.jobName, lockAcq.holderId);
  }
}
