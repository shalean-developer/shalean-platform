import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron/verifyCronSecret";
import { logCronRun, logSystemEvent } from "@/lib/logging/systemLog";
import { recoverStuckPublishClaims } from "@/lib/promotions/publishIdempotency";
import { recoverExpiredPublishJobLeases } from "@/lib/promotions/publishJobs";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * MKT-001B / MKT-001B.2 — Recover abandoned publish claims + expired job leases.
 *
 * Auth: `Authorization: Bearer CRON_SECRET` or `x-cron-secret`
 * Schedule: daily in vercel.json (`0 4 * * *`) — Hobby plans reject sub-daily
 * expressions. Primary job drain is `/api/cron/process-social-publish-jobs`
 * via Supabase pg_cron.
 */
export async function POST(request: Request) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const result = await recoverStuckPublishClaims(admin);
  const leases = await recoverExpiredPublishJobLeases(admin, { limit: 100 });

  await logSystemEvent({
    level: result.errors.length > 0 || leases.error ? "warn" : "info",
    source: "cron/recover-stuck-publish",
    message: "recover_stuck_publish_claims",
    context: {
      scanned: result.scanned,
      recovered: result.recovered,
      expiredLeasesRecovered: leases.recovered,
      errorCount: result.errors.length,
      errors: result.errors.slice(0, 10),
      leaseError: leases.error ?? null,
    },
  });

  await logCronRun({
    jobName: "recover-stuck-publish",
    status: result.errors.length > 0 && result.recovered === 0 ? "error" : "success",
    message: `scanned=${result.scanned} recovered=${result.recovered} leases=${leases.recovered}`,
    context: {
      scanned: result.scanned,
      recovered: result.recovered,
      expiredLeasesRecovered: leases.recovered,
    },
  });

  return NextResponse.json({
    ok: true,
    scanned: result.scanned,
    recovered: result.recovered,
    expiredLeasesRecovered: leases.recovered,
    errors: result.errors,
  });
}
