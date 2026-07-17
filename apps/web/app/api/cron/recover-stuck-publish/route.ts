import { NextResponse } from "next/server";
import { logCronRun, logSystemEvent } from "@/lib/logging/systemLog";
import { recoverStuckPublishClaims } from "@/lib/promotions/publishIdempotency";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * MKT-001B — Recover abandoned publish idempotency claims.
 *
 * Marks stuck `processing` rows (older than 10 minutes) as `failed` so:
 * - operators can see interrupted publishes
 * - the next admin retry reclaim path works cleanly
 *
 * Auth: `Authorization: Bearer CRON_SECRET`
 * Suggested schedule: every 15 minutes — POST /api/cron/recover-stuck-publish
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const result = await recoverStuckPublishClaims(admin);

  await logSystemEvent({
    level: result.errors.length > 0 ? "warn" : "info",
    source: "cron/recover-stuck-publish",
    message: "recover_stuck_publish_claims",
    context: {
      scanned: result.scanned,
      recovered: result.recovered,
      errorCount: result.errors.length,
      errors: result.errors.slice(0, 10),
    },
  });

  await logCronRun({
    jobName: "recover-stuck-publish",
    status: result.errors.length > 0 && result.recovered === 0 ? "error" : "success",
    message: `scanned=${result.scanned} recovered=${result.recovered}`,
    context: { scanned: result.scanned, recovered: result.recovered },
  });

  return NextResponse.json({
    ok: true,
    scanned: result.scanned,
    recovered: result.recovered,
    errors: result.errors,
  });
}
