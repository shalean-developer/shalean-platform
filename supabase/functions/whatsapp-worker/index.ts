import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { verifyCronSecret } from "../_shared/auth.ts";
import { BATCH_LIMITS, loadWorkerConfig } from "../_shared/config.ts";
import { CRON_LOCK_KEYS, withCronLock } from "../_shared/cron.ts";
import { logCronRun, logSystemEvent } from "../_shared/logger.ts";
import { errorResponse, okResponse, skippedResponse } from "../_shared/responses.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { clampBatchLimit } from "../_shared/utils.ts";
import { processWhatsAppPendingBatch } from "./processBatch.ts";

const JOB_NAME = CRON_LOCK_KEYS.whatsappWorker;

serve(async (req: Request) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  let cfg;
  try {
    cfg = loadWorkerConfig();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return errorResponse(msg, 503);
  }

  const auth = verifyCronSecret(req, cfg.cronSecret);
  if (!auth.ok) {
    return errorResponse(auth.body.error, auth.status);
  }

  const admin = getSupabaseAdmin();
  const url = new URL(req.url);
  const limit = clampBatchLimit(
    url.searchParams.get("limit"),
    BATCH_LIMITS.whatsappWorker,
    BATCH_LIMITS.whatsappWorkerMax,
  );
  const includeQueueMetrics = url.searchParams.get("metrics") === "1";

  const lockResult = await withCronLock(admin, JOB_NAME, async () => {
    return processWhatsAppPendingBatch({
      admin,
      cfg,
      limit,
      includeQueueMetrics,
    });
  }, 120);

  if (lockResult.skipped) {
    await logCronRun({
      jobName: JOB_NAME,
      status: "skipped",
      message: lockResult.reason ?? "concurrent_run",
      admin,
    });
    return skippedResponse(lockResult.reason ?? "concurrent_run");
  }

  const result = lockResult.result!;
  try {
    await logSystemEvent({
      level: "info",
      source: "edge/cron/whatsapp-worker",
      message: `Processed ${result.processed} queue job(s)`,
      context: { ...result, degraded_lock: lockResult.degraded ?? false },
      admin,
    });
    await logCronRun({
      jobName: JOB_NAME,
      status: "success",
      message: `processed=${result.processed} ok=${result.ok} failed=${result.failed}`,
      context: result,
      admin,
    });
  } catch (e) {
    console.error("[whatsapp-worker] logging failed", e);
  }

  return okResponse({
    processed: result.processed,
    succeeded: result.ok,
    failed: result.failed,
    queue_metrics: result.queue_metrics,
    worker_meta: result.worker_meta,
  });
});
