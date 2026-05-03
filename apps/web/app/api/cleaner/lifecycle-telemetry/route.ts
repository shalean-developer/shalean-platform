import { NextResponse } from "next/server";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["queued", "synced", "flush_failed"]);
const ALLOWED_FLUSH_TRIGGER = new Set([
  "enqueue",
  "bc",
  "visibility",
  "interval",
  "initial",
  "online",
  "unknown",
]);

export async function POST(request: Request) {
  let body: {
    booking_id?: string;
    action?: string;
    status?: string;
    detail?: string;
    queued_at_ms?: number;
    attempt_count?: number;
    final_status?: string;
    network_online?: boolean;
    phase_before?: string;
    queue_depth_at_flush?: number;
    flush_cycle_steps?: number;
    bc_events_received_session?: number;
    cas_retries_count?: number;
    backoff_ms_applied?: number;
    flush_skipped_stale_count?: number;
    peek_calls_count?: number;
    flush_latency_ms?: number;
    flush_cycle_timed_out?: boolean;
    flush_items_attempted?: number;
    flush_items_succeeded?: number;
    flush_items_failed?: number;
    flush_items_deferred?: number;
    flush_trigger?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const status = typeof body.status === "string" ? body.status.trim() : "";
  if (!ALLOWED.has(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }
  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) {
    return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });
  }

  const booking_id = typeof body.booking_id === "string" ? body.booking_id.trim() : "";
  const action = typeof body.action === "string" ? body.action.trim() : "";
  const detail = typeof body.detail === "string" ? body.detail.trim().slice(0, 500) : undefined;
  const queuedAtMs =
    typeof body.queued_at_ms === "number" && Number.isFinite(body.queued_at_ms) ? Math.floor(body.queued_at_ms) : null;
  const queueResolutionTimeMs =
    status === "synced" && queuedAtMs != null && queuedAtMs > 0 ? Math.max(0, Date.now() - queuedAtMs) : null;

  const attemptCount =
    typeof body.attempt_count === "number" && Number.isFinite(body.attempt_count)
      ? Math.max(0, Math.floor(body.attempt_count))
      : null;
  const finalStatus = typeof body.final_status === "string" ? body.final_status.trim().slice(0, 32) : status;
  const networkOnline = typeof body.network_online === "boolean" ? body.network_online : null;
  const phase_before =
    typeof body.phase_before === "string" ? body.phase_before.trim().slice(0, 64) : null;
  const queueDepthAtFlush =
    typeof body.queue_depth_at_flush === "number" && Number.isFinite(body.queue_depth_at_flush)
      ? Math.max(0, Math.floor(body.queue_depth_at_flush))
      : null;
  const flushCycleSteps =
    typeof body.flush_cycle_steps === "number" && Number.isFinite(body.flush_cycle_steps)
      ? Math.max(0, Math.floor(body.flush_cycle_steps))
      : null;
  const bcEventsReceivedSession =
    typeof body.bc_events_received_session === "number" && Number.isFinite(body.bc_events_received_session)
      ? Math.max(0, Math.floor(body.bc_events_received_session))
      : null;
  const casRetriesCount =
    typeof body.cas_retries_count === "number" && Number.isFinite(body.cas_retries_count)
      ? Math.max(0, Math.floor(body.cas_retries_count))
      : null;
  const backoffMsApplied =
    typeof body.backoff_ms_applied === "number" && Number.isFinite(body.backoff_ms_applied)
      ? Math.max(0, Math.floor(body.backoff_ms_applied))
      : null;
  const flushSkippedStaleCount =
    typeof body.flush_skipped_stale_count === "number" && Number.isFinite(body.flush_skipped_stale_count)
      ? Math.max(0, Math.floor(body.flush_skipped_stale_count))
      : null;
  const peekCallsCount =
    typeof body.peek_calls_count === "number" && Number.isFinite(body.peek_calls_count)
      ? Math.max(0, Math.floor(body.peek_calls_count))
      : null;
  const flushLatencyMs =
    typeof body.flush_latency_ms === "number" && Number.isFinite(body.flush_latency_ms)
      ? Math.max(0, Math.floor(body.flush_latency_ms))
      : null;
  const flushCycleTimedOut = typeof body.flush_cycle_timed_out === "boolean" ? body.flush_cycle_timed_out : null;
  const flushItemsAttempted =
    typeof body.flush_items_attempted === "number" && Number.isFinite(body.flush_items_attempted)
      ? Math.max(0, Math.floor(body.flush_items_attempted))
      : null;
  const flushItemsSucceeded =
    typeof body.flush_items_succeeded === "number" && Number.isFinite(body.flush_items_succeeded)
      ? Math.max(0, Math.floor(body.flush_items_succeeded))
      : null;
  const flushItemsFailed =
    typeof body.flush_items_failed === "number" && Number.isFinite(body.flush_items_failed)
      ? Math.max(0, Math.floor(body.flush_items_failed))
      : null;
  const flushItemsDeferred =
    typeof body.flush_items_deferred === "number" && Number.isFinite(body.flush_items_deferred)
      ? Math.max(0, Math.floor(body.flush_items_deferred))
      : null;
  const flushTriggerRaw = typeof body.flush_trigger === "string" ? body.flush_trigger.trim() : "";
  const flushTrigger = ALLOWED_FLUSH_TRIGGER.has(flushTriggerRaw) ? flushTriggerRaw : null;

  const message =
    status === "queued"
      ? "job_action_offline_queued"
      : status === "synced"
        ? "job_action_synced"
        : "job_action_flush_failed";

  void logSystemEvent({
    level: "info",
    source: "cleaner_job_lifecycle_client",
    message,
    context: {
      cleaner_id: session.cleanerId,
      booking_id: booking_id || null,
      action: action || null,
      detail: detail ?? null,
      queued_at_ms: queuedAtMs,
      ...(queueResolutionTimeMs != null ? { queue_resolution_time_ms: queueResolutionTimeMs } : {}),
      ...(attemptCount != null ? { attempt_count: attemptCount } : {}),
      final_status: finalStatus || null,
      network_online: networkOnline,
      phase_before: phase_before || null,
      ...(queueDepthAtFlush != null ? { queue_depth_at_flush: queueDepthAtFlush } : {}),
      ...(flushCycleSteps != null ? { flush_cycle_steps: flushCycleSteps } : {}),
      ...(bcEventsReceivedSession != null ? { bc_events_received_session: bcEventsReceivedSession } : {}),
      ...(casRetriesCount != null ? { cas_retries_count: casRetriesCount } : {}),
      ...(backoffMsApplied != null ? { backoff_ms_applied: backoffMsApplied } : {}),
      ...(flushSkippedStaleCount != null ? { flush_skipped_stale_count: flushSkippedStaleCount } : {}),
      ...(peekCallsCount != null ? { peek_calls_count: peekCallsCount } : {}),
      ...(flushLatencyMs != null ? { flush_latency_ms: flushLatencyMs } : {}),
      ...(flushCycleTimedOut != null ? { flush_cycle_timed_out: flushCycleTimedOut } : {}),
      ...(flushItemsAttempted != null ? { flush_items_attempted: flushItemsAttempted } : {}),
      ...(flushItemsSucceeded != null ? { flush_items_succeeded: flushItemsSucceeded } : {}),
      ...(flushItemsFailed != null ? { flush_items_failed: flushItemsFailed } : {}),
      ...(flushItemsDeferred != null ? { flush_items_deferred: flushItemsDeferred } : {}),
      ...(flushTrigger ? { flush_trigger: flushTrigger } : {}),
    },
  });

  return NextResponse.json({ ok: true });
}
