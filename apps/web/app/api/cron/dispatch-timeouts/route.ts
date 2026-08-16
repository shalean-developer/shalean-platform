import { NextResponse } from "next/server";
import { withCronLock } from "@/lib/cron/cronLock";
import { CRON_LOCK_KEYS } from "@/lib/cron/cronLockKeys";
import { verifyCronSecret } from "@/lib/cron/verifyCronSecret";
import { runDispatchTimeouts } from "@/lib/dispatch/runDispatchTimeouts";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "/api/cron/dispatch-timeouts";

/**
 * Cron: `Authorization: Bearer CRON_SECRET` (Vercel) or `x-cron-secret: CRON_SECRET` (Supabase pg_net).
 * Expires pending dispatch offers past `expires_at` and runs reassignment when safe.
 */
export async function GET(request: Request) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const timestamp = new Date().toISOString();
  let lockResult: Awaited<ReturnType<typeof withCronLock<Awaited<ReturnType<typeof runDispatchTimeouts>>>>>;
  try {
    /* H-15: shared lock with dispatch-expiry — same engine, two URLs. */
    lockResult = await withCronLock(
      admin,
      { jobName: CRON_LOCK_KEYS.dispatchTimeouts, leaseSeconds: 600 },
      () => runDispatchTimeouts(admin),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await reportOperationalIssue("error", ROUTE, `runDispatchTimeouts threw: ${msg}`, { timestamp });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  if (lockResult.skipped) {
    return NextResponse.json({ ok: true, skipped: true, reason: lockResult.reason });
  }

  const stats = lockResult.ranIt;
  const meaningfulActivity =
    stats.errors > 0 ||
    stats.expired > 0 ||
    stats.scanned > 0 ||
    stats.offerCapHits > 0 ||
    stats.strandedEnqueued > 0 ||
    stats.reassignmentQueued > 0;

  if (meaningfulActivity) {
    await logSystemEvent({
      level: stats.errors > 0 ? "warn" : "info",
      source: "cron",
      message: "cron.complete",
      context: { route: ROUTE, result: { ok: stats.errors === 0, ...stats } },
    });
  }

  return NextResponse.json({ ok: true, ...stats });
}

export async function POST(request: Request) {
  return GET(request);
}
