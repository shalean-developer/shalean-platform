import { NextResponse } from "next/server";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_ERROR_RETENTION_DAYS = 90;
const DEFAULT_PROTECTED_RETENTION_DAYS = 180;
const DEFAULT_BATCH_SIZE = 5_000;
const DEFAULT_MAX_BATCHES = 10;

function boundedInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}

/**
 * Daily retention maintenance for system_logs.
 *
 * Routine info/warn rows use SYSTEM_LOG_RETENTION_DAYS (default 30d), errors use
 * SYSTEM_LOG_ERROR_RETENTION_DAYS (default 90d), and audit/security/auth sources use
 * SYSTEM_LOG_PROTECTED_RETENTION_DAYS (default 180d).
 *
 * Each RPC deletes a bounded batch. This route runs several small transactions instead of
 * one unbounded DELETE, avoiding the statement timeout that caused the historical backlog.
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

  const retentionDays = boundedInt(process.env.SYSTEM_LOG_RETENTION_DAYS, DEFAULT_RETENTION_DAYS, 1, 365);
  const errorRetentionDays = Math.max(
    retentionDays,
    boundedInt(process.env.SYSTEM_LOG_ERROR_RETENTION_DAYS, DEFAULT_ERROR_RETENTION_DAYS, 1, 730),
  );
  const protectedRetentionDays = Math.max(
    errorRetentionDays,
    boundedInt(process.env.SYSTEM_LOG_PROTECTED_RETENTION_DAYS, DEFAULT_PROTECTED_RETENTION_DAYS, 1, 1095),
  );
  const batchSize = boundedInt(process.env.SYSTEM_LOG_PRUNE_BATCH_SIZE, DEFAULT_BATCH_SIZE, 100, 10_000);
  const maxBatches = boundedInt(process.env.SYSTEM_LOG_PRUNE_MAX_BATCHES, DEFAULT_MAX_BATCHES, 1, 20);

  let deleted = 0;
  let batches = 0;

  for (let i = 0; i < maxBatches; i += 1) {
    const { data, error } = await admin.rpc("prune_system_logs", {
      p_retention_days: retentionDays,
      p_error_retention_days: errorRetentionDays,
      p_protected_retention_days: protectedRetentionDays,
      p_batch_size: batchSize,
    });

    if (error) {
      await reportOperationalIssue("error", "cron/prune-system-logs", error.message, {
        retentionDays,
        errorRetentionDays,
        protectedRetentionDays,
        batchSize,
        batches,
        deleted,
      });
      return NextResponse.json({ error: error.message, deleted, batches }, { status: 500 });
    }

    const batchDeleted = typeof data === "number" ? data : Number(data ?? 0);
    deleted += Number.isFinite(batchDeleted) ? batchDeleted : 0;
    batches += 1;

    if (batchDeleted < batchSize) break;
  }

  if (deleted > 0) {
    await logSystemEvent({
      level: "info",
      source: "cron/prune-system-logs",
      message: `Pruned ${deleted} system_logs row(s) in ${batches} batch(es)`,
      context: {
        deleted,
        batches,
        batchSize,
        retentionDays,
        errorRetentionDays,
        protectedRetentionDays,
        backlogMayRemain: batches === maxBatches && deleted >= batchSize * maxBatches,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    deleted,
    batches,
    batchSize,
    retentionDays,
    errorRetentionDays,
    protectedRetentionDays,
    backlogMayRemain: batches === maxBatches && deleted >= batchSize * maxBatches,
  });
}

export async function GET(request: Request) {
  return POST(request);
}
