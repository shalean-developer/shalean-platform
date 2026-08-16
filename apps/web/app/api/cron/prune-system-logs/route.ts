import { NextResponse } from "next/server";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_BATCH_SIZE = 5_000;
const DEFAULT_MAX_BATCHES = 10;

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}

/**
 * Daily retention maintenance for `system_logs`.
 *
 * Deletes expired rows in bounded batches through `prune_system_logs_batch`, avoiding the
 * statement timeouts caused by one very large DELETE. Defaults to at most 50k rows/run
 * (10 x 5k) while preserving the existing 30-day retention policy.
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

  const retentionDays = boundedInteger(
    process.env.SYSTEM_LOG_RETENTION_DAYS,
    DEFAULT_RETENTION_DAYS,
    1,
    365,
  );
  const batchSize = boundedInteger(
    process.env.SYSTEM_LOG_PRUNE_BATCH_SIZE,
    DEFAULT_BATCH_SIZE,
    100,
    10_000,
  );
  const maxBatches = boundedInteger(
    process.env.SYSTEM_LOG_PRUNE_MAX_BATCHES,
    DEFAULT_MAX_BATCHES,
    1,
    20,
  );

  let deleted = 0;
  let batches = 0;

  for (let i = 0; i < maxBatches; i += 1) {
    const { data, error } = await admin.rpc("prune_system_logs_batch", {
      p_retention_days: retentionDays,
      p_batch_size: batchSize,
    });

    if (error) {
      await reportOperationalIssue("error", "cron/prune-system-logs", error.message, {
        retentionDays,
        batchSize,
        maxBatches,
        batches,
        deleted,
      });
      return NextResponse.json(
        { error: error.message, deleted, batches, retentionDays, batchSize, maxBatches },
        { status: 500 },
      );
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
      message: `Pruned ${deleted} system_logs row(s) older than ${retentionDays}d`,
      context: { deleted, batches, retentionDays, batchSize, maxBatches },
    });
  }

  return NextResponse.json({ ok: true, deleted, batches, retentionDays, batchSize, maxBatches });
}

export async function GET(request: Request) {
  return POST(request);
}
