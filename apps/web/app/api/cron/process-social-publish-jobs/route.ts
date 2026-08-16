import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { acquireCronLock, releaseCronLock } from "@/lib/cron/cronLock";
import { CRON_LOCK_KEYS } from "@/lib/cron/cronLockKeys";
import { verifyCronSecret } from "@/lib/cron/verifyCronSecret";
import { logCronRun, logSystemEvent } from "@/lib/logging/systemLog";
import { bootstrapProviderRegistry } from "@/lib/promotions/providers";
import {
  claimDuePublishJobs,
  executePublishJob,
  newPublishJobHolderId,
  recoverExpiredPublishJobLeases,
} from "@/lib/promotions/publishJobs";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requestCronCredential(request: Request): string | null {
  const headerSecret = request.headers.get("x-cron-secret")?.trim();
  if (headerSecret) return headerSecret;
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function secretsMatch(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function verifyConfiguredCronTargetSecret(request: Request): Promise<boolean> {
  const supplied = requestCronCredential(request);
  if (!supplied) return false;

  const admin = getSupabaseAdmin();
  if (!admin) return false;

  const { data, error } = await admin
    .from("cron_http_targets")
    .select("cron_secret")
    .eq("singleton", true)
    .maybeSingle();

  if (error || !data?.cron_secret) return false;
  return secretsMatch(supplied, String(data.cron_secret).trim());
}

/**
 * MKT-001B.2 — Process durable social publish jobs.
 *
 * Auth: Bearer CRON_SECRET or x-cron-secret (pg_cron / pg_net).
 * Primary schedule: Supabase pg_cron (migration-controlled).
 * Backup: Vercel daily cron (Hobby-safe) also registered in vercel.json.
 */
export async function POST(request: Request) {
  bootstrapProviderRegistry();

  const envAuth = verifyCronSecret(request);
  if (!envAuth.ok && !(await verifyConfiguredCronTargetSecret(request))) {
    return NextResponse.json(envAuth.body, { status: envAuth.status });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const lockAcq = await acquireCronLock(admin, {
    jobName: CRON_LOCK_KEYS.processSocialPublishJobs,
    leaseSeconds: 300,
  });
  if (!lockAcq.ok) {
    return NextResponse.json({ ok: true, skipped: lockAcq.reason });
  }

  const holder = newPublishJobHolderId();
  let processed = 0;
  let succeeded = 0;
  let retryable = 0;
  let deadLetter = 0;
  let providerCalls = 0;
  const errors: string[] = [];

  try {
    const recovered = await recoverExpiredPublishJobLeases(admin, { limit: 100 });
    const claimed = await claimDuePublishJobs(admin, {
      limit: 10,
      holder,
      leaseSeconds: 120,
    });

    for (const job of claimed.jobs) {
      try {
        const result = await executePublishJob({ admin, job });
        processed += 1;
        if (result.providerCalled) providerCalls += 1;
        if (result.job.status === "succeeded") succeeded += 1;
        else if (result.job.status === "retryable") retryable += 1;
        else if (result.job.status === "dead_letter") deadLetter += 1;
      } catch (e) {
        errors.push(`${job.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const meaningfulActivity =
      recovered.recovered > 0 || claimed.jobs.length > 0 || processed > 0 || errors.length > 0;

    if (meaningfulActivity) {
      await logSystemEvent({
        level: errors.length > 0 ? "warn" : "info",
        source: "cron/process-social-publish-jobs",
        message: "process_social_publish_jobs",
        context: {
          claimVia: claimed.via,
          recoveredLeases: recovered.recovered,
          claimed: claimed.jobs.length,
          processed,
          succeeded,
          retryable,
          deadLetter,
          providerCalls,
          errorCount: errors.length,
          errors: errors.slice(0, 10),
        },
      });
    }

    await logCronRun({
      jobName: "process-social-publish-jobs",
      status: errors.length > 0 && processed === 0 ? "error" : "success",
      message: `processed=${processed} succeeded=${succeeded} dlq=${deadLetter}`,
      context: { processed, succeeded, retryable, deadLetter, providerCalls },
    });

    return NextResponse.json({
      ok: true,
      recoveredLeases: recovered.recovered,
      claimed: claimed.jobs.length,
      claimVia: claimed.via,
      processed,
      succeeded,
      retryable,
      deadLetter,
      providerCalls,
      errors,
    });
  } finally {
    if (!lockAcq.degraded) {
      await releaseCronLock(admin, lockAcq.jobName, lockAcq.holderId);
    }
  }
}
