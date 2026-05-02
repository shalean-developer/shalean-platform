import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";

export type LifecycleClientTelemetryStatus = "queued" | "synced" | "flush_failed";

export async function logCleanerLifecycleClientEvent(params: {
  bookingId: string;
  action: string;
  status: LifecycleClientTelemetryStatus;
  detail?: string;
  /** When status is `synced`, server can derive queue_resolution_time_ms from this. */
  queuedAtMs?: number;
  attemptCount?: number;
  /** Mirrors `status` for log dashboards. */
  finalStatus?: LifecycleClientTelemetryStatus;
  networkOnline?: boolean;
  /** Mobile lifecycle phase label before the action (funnel analysis). */
  phaseBefore?: string;
  /** Pending lifecycle rows globally when this flush telemetry was emitted. */
  queueDepthAtFlush?: number;
  /** Chained flush depth this invocation (0 = root flush). */
  flushCycleSteps?: number;
  /** BroadcastChannel queue notifications applied this session (cumulative). */
  bcEventsReceivedSession?: number;
  /** CAS async retry iterations since flush item start (queue writes). */
  casRetriesCount?: number;
  /** Approximate backoff window applied after a flush failure (ms). */
  backoffMsApplied?: number;
  /** Flush cycle: rows skipped as stale / superseded before POST. */
  flushSkippedStaleCount?: number;
  /** Flush cycle: network peeks (not cache hits). */
  peekCallsCount?: number;
  /** Wall time for one flush invocation (ms) — primary production health signal. */
  flushLatencyMs?: number;
  /** True when flush stopped early after exceeding max wall time budget. */
  flushCycleTimedOut?: boolean;
  /** Flush cycle: rows where a POST was attempted (after stale superseded filter). */
  flushItemsAttempted?: number;
  /** Flush cycle: rows cleared successfully (POST ok, 409, client 4xx remove, stale wire drop). */
  flushItemsSucceeded?: number;
  /** Flush cycle: rows that hit flush_failed (HTTP 5xx / network). */
  flushItemsFailed?: number;
  /** Flush cycle: rows not reached (timeout, auth break) or remaining rotation tail. */
  flushItemsDeferred?: number;
}): Promise<void> {
  try {
    const headers = await getCleanerAuthHeaders();
    if (!headers) return;
    await fetch("/api/cleaner/lifecycle-telemetry", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        booking_id: params.bookingId,
        action: params.action,
        status: params.status,
        detail: params.detail,
        queued_at_ms: params.queuedAtMs,
        attempt_count: params.attemptCount,
        final_status: params.finalStatus ?? params.status,
        network_online: params.networkOnline,
        phase_before: params.phaseBefore,
        queue_depth_at_flush: params.queueDepthAtFlush,
        flush_cycle_steps: params.flushCycleSteps,
        bc_events_received_session: params.bcEventsReceivedSession,
        cas_retries_count: params.casRetriesCount,
        backoff_ms_applied: params.backoffMsApplied,
        flush_skipped_stale_count: params.flushSkippedStaleCount,
        peek_calls_count: params.peekCallsCount,
        flush_latency_ms: params.flushLatencyMs,
        flush_cycle_timed_out: params.flushCycleTimedOut,
        flush_items_attempted: params.flushItemsAttempted,
        flush_items_succeeded: params.flushItemsSucceeded,
        flush_items_failed: params.flushItemsFailed,
        flush_items_deferred: params.flushItemsDeferred,
      }),
      keepalive: true,
    });
  } catch {
    /* ignore */
  }
}
