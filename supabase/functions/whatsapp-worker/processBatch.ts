import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkerConfig } from "../_shared/config.ts";
import { BATCH_LIMITS } from "../_shared/config.ts";
import { metaCircuitOpenRemainingMs } from "../_shared/metaSend.ts";
import { clampBatchLimit } from "../_shared/utils.ts";
import { flushWhatsAppJobById } from "./flushJob.ts";
import { getWhatsAppQueueStatusCounts, listPendingWhatsAppJobIds, logRpcFallback } from "./listPending.ts";
import { recoverStaleProcessingJobs } from "./queueUtils.ts";
import type { ProcessBatchResult } from "./types.ts";

/** Drain one batch of pending WhatsApp queue jobs (parity with Vercel cron). */
export async function processWhatsAppPendingBatch(params: {
  admin: SupabaseClient;
  cfg: WorkerConfig;
  limit?: number;
  includeQueueMetrics?: boolean;
}): Promise<ProcessBatchResult> {
  const t0 = Date.now();
  const limitRequested = clampBatchLimit(params.limit, BATCH_LIMITS.whatsappWorker, BATCH_LIMITS.whatsappWorkerMax);

  await recoverStaleProcessingJobs(params.admin);

  const counts0 = await getWhatsAppQueueStatusCounts(params.admin);
  const depth = counts0.pending + counts0.processing;

  let limitEffective = limitRequested;
  const backThresh = params.cfg.whatsappQueueBackpressureThreshold;
  if (backThresh > 0 && depth > backThresh) {
    limitEffective = Math.max(3, Math.floor(limitRequested / 2));
  } else if (depth > 500) {
    limitEffective = Math.max(3, limitRequested - 3);
  }
  const limit = Math.min(limitRequested, limitEffective);

  const { ids, rpc_error } = await listPendingWhatsAppJobIds(params.admin, limit);
  await logRpcFallback(params.admin, rpc_error, ids);

  const emptyMeta = {
    batch_limit_requested: limitRequested,
    batch_limit_effective: limit,
    queue_depth_proxy: depth,
    duration_ms: Date.now() - t0,
    meta_circuit_open_remaining_ms: metaCircuitOpenRemainingMs(),
    circuit_retry_scheduled: 0,
  };

  if (!ids.length) {
    return {
      processed: 0,
      ok: 0,
      failed: 0,
      queue_metrics: params.includeQueueMetrics ? counts0 : undefined,
      worker_meta: emptyMeta,
    };
  }

  let ok = 0;
  let failed = 0;
  let circuitRetryScheduled = 0;

  for (const id of ids) {
    const out = await flushWhatsAppJobById(params.admin, params.cfg, id);
    if (out.ok) ok++;
    else {
      failed++;
      if (out.meta_circuit_retry_scheduled) circuitRetryScheduled++;
    }
  }

  const queue_metrics = params.includeQueueMetrics
    ? await getWhatsAppQueueStatusCounts(params.admin)
    : undefined;

  return {
    processed: ids.length,
    ok,
    failed,
    queue_metrics,
    worker_meta: {
      ...emptyMeta,
      duration_ms: Date.now() - t0,
      circuit_retry_scheduled: circuitRetryScheduled,
    },
  };
}
