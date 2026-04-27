import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyDispatchEscalationAdmin } from "@/lib/dispatch/dispatchEscalation";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { metrics } from "@/lib/metrics/counters";

/** Minutes after failure before each retry wave (cron-compatible). */
export const DISPATCH_RETRY_DELAYS_MIN = [2, 5, 10, 15] as const;

const EXCLUDE_CLEANER_PREFIX = "exclude_cleaner:";

/** Encoded in `dispatch_retry_queue.last_reason` so retries keep excluding the timed-out cleaner. */
export function parseDispatchRetryExcludeCleanerId(lastReason: string | null | undefined): string | null {
  if (!lastReason || !lastReason.startsWith(EXCLUDE_CLEANER_PREFIX)) return null;
  const rest = lastReason.slice(EXCLUDE_CLEANER_PREFIX.length);
  const pipe = rest.indexOf("|");
  const id = (pipe >= 0 ? rest.slice(0, pipe) : rest).trim();
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

function mergeDispatchRetryLastReason(excludeCleanerId: string | null, tail: string): string {
  const t = tail.trim() || "unknown";
  return excludeCleanerId ? `${EXCLUDE_CLEANER_PREFIX}${excludeCleanerId}|${t}` : t;
}

function addMinutesIso(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function addSecondsIso(seconds: number): string {
  return new Date(Date.now() + Math.max(1, seconds) * 1000).toISOString();
}

/**
 * After a failed assign from the retry queue: delay = base_seconds × (retries_done + 1).
 * Default base 30 → 30s, 60s, 90s, … capped at 15m. Override: DISPATCH_RETRY_BACKOFF_BASE_SECONDS (15–120).
 */
export function resolveDispatchRetryBackoffSeconds(retriesDone: number): number {
  const base = Number(process.env.DISPATCH_RETRY_BACKOFF_BASE_SECONDS);
  const b = Number.isFinite(base) && base >= 15 && base <= 120 ? Math.round(base) : 30;
  const attempt = Math.max(0, retriesDone) + 1;
  return Math.min(b * attempt, 900);
}

/**
 * Phase 8E: first retry delay from recent cleaner response latencies (bounded).
 * Set `DISPATCH_ADAPTIVE_RETRY=false` to always use {@link DISPATCH_RETRY_DELAYS_MIN}[0].
 */
export async function resolveAdaptiveFirstRetryDelayMin(supabase: SupabaseClient): Promise<number> {
  const base = DISPATCH_RETRY_DELAYS_MIN[0] ?? 2;
  if (String(process.env.DISPATCH_ADAPTIVE_RETRY ?? "").toLowerCase() === "false") return base;

  const { data } = await supabase
    .from("dispatch_offers")
    .select("response_latency_ms")
    .not("response_latency_ms", "is", null)
    .order("created_at", { ascending: false })
    .limit(80);

  const arr = (data ?? [])
    .map((r) => Number((r as { response_latency_ms?: number | null }).response_latency_ms))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (arr.length < 10) return base;

  const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.min(8, Math.max(2, Math.round(avg / 120_000)));
}

export type EnqueueDispatchRetryOptions = {
  /** First attempt time (seconds from now). When set, overrides adaptive minute-based delay. */
  firstDelaySeconds?: number;
  /** Persisted in `last_reason` so `processDispatchRetryQueue` can `excludeCleanerIds` on assign. */
  excludeCleanerId?: string;
};

/**
 * Queue a paid booking for a later auto-assign attempt (no duplicate pending rows).
 * @returns true when a new pending row was inserted.
 */
export async function enqueueDispatchRetry(
  supabase: SupabaseClient,
  bookingId: string,
  reason?: string,
  options?: EnqueueDispatchRetryOptions,
): Promise<boolean> {
  const { data: pending } = await supabase
    .from("dispatch_retry_queue")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("status", "pending")
    .maybeSingle();

  if (pending) return false;

  const excludeId = options?.excludeCleanerId?.trim() || "";
  const baseReason = reason?.trim() || null;
  const lastReason =
    excludeId && /^[0-9a-f-]{36}$/i.test(excludeId)
      ? mergeDispatchRetryLastReason(excludeId, baseReason ?? "queued")
      : baseReason;

  let nextRetryAt: string;
  if (options?.firstDelaySeconds != null) {
    const sec = Math.max(1, Math.min(600, Math.round(options.firstDelaySeconds)));
    nextRetryAt = new Date(Date.now() + sec * 1000).toISOString();
  } else {
    const firstDelay = await resolveAdaptiveFirstRetryDelayMin(supabase);
    nextRetryAt = addMinutesIso(firstDelay);
  }

  const { error } = await supabase.from("dispatch_retry_queue").insert({
    booking_id: bookingId,
    retries_done: 0,
    next_retry_at: nextRetryAt,
    status: "pending",
    last_reason: lastReason,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    await reportOperationalIssue("warn", "enqueueDispatchRetry", error.message, { bookingId });
    return false;
  }

  return true;
}

type ProcessResult = { picked: number; assigned: number; abandoned: number; errors: number };

/**
 * Invoked from cron: process due rows, call ensureBookingAssignment, reschedule or close.
 */
export async function processDispatchRetryQueue(supabase: SupabaseClient): Promise<ProcessResult> {
  const out: ProcessResult = { picked: 0, assigned: 0, abandoned: 0, errors: 0 };
  const nowIso = new Date().toISOString();

  const { data: rows, error: selErr } = await supabase
    .from("dispatch_retry_queue")
    .select("id, booking_id, retries_done, last_reason")
    .eq("status", "pending")
    .lte("next_retry_at", nowIso)
    .order("next_retry_at", { ascending: true })
    .limit(25);

  if (selErr) {
    await reportOperationalIssue("error", "processDispatchRetryQueue", selErr.message);
    out.errors++;
    return out;
  }

  const { ensureBookingAssignment } = await import("@/lib/dispatch/ensureBookingAssignment");

  for (const row of rows ?? []) {
    const id = typeof row.id === "string" ? row.id : null;
    const bookingId = typeof row.booking_id === "string" ? row.booking_id : null;
    if (!id || !bookingId) continue;
    out.picked++;

    const retriesDone = typeof row.retries_done === "number" ? row.retries_done : 0;

    const lastReason =
      row && typeof row === "object" && "last_reason" in row
        ? String((row as { last_reason?: string | null }).last_reason ?? "")
        : null;

    const excludeCleanerId = parseDispatchRetryExcludeCleanerId(lastReason);

    if (retriesDone >= 3) {
      await notifyDispatchEscalationAdmin({
        bookingId,
        retriesDone,
        lastReason: lastReason || null,
      });
    }

    const result = await ensureBookingAssignment(supabase, bookingId, {
      source: "dispatch_retry_queue",
      retryEscalation: retriesDone,
      smartAssign: excludeCleanerId ? { excludeCleanerIds: [excludeCleanerId] } : undefined,
    });

    if (result.ok) {
      await supabase
        .from("dispatch_retry_queue")
        .update({
          status: "done",
          updated_at: new Date().toISOString(),
          last_reason: null,
        })
        .eq("id", id);
      out.assigned++;
      metrics.increment("dispatch.retry_queue.assigned", { bookingId, retriesDone });
      continue;
    }

    if (result.error === "booking_not_pending") {
      await supabase
        .from("dispatch_retry_queue")
        .update({ status: "done", updated_at: new Date().toISOString(), last_reason: "booking_not_pending" })
        .eq("id", id);
      continue;
    }

    if (retriesDone >= 4) {
      await supabase
        .from("dispatch_retry_queue")
        .update({
          status: "abandoned",
          updated_at: new Date().toISOString(),
          last_reason: result.message ?? result.error,
        })
        .eq("id", id);
      out.abandoned++;

      const terminalDispatchStatus = result.error === "no_candidate" ? "no_cleaner" : "unassignable";

      await supabase
        .from("bookings")
        .update({ dispatch_status: terminalDispatchStatus })
        .eq("id", bookingId)
        .eq("status", "pending")
        .is("cleaner_id", null);

      metrics.increment("dispatch.unassignable", {
        bookingId,
        error: result.error,
        message: result.message ?? null,
        terminalDispatchStatus,
      });

      await notifyDispatchEscalationAdmin({
        bookingId,
        retriesDone,
        lastReason: result.message ?? result.error,
        phase: "terminal_unassignable",
      });

      await logSystemEvent({
        level: "warn",
        source: "dispatch_retry_abandoned",
        message: `Dispatch retries exhausted — booking dispatch_status=${terminalDispatchStatus}`,
        context: { bookingId, error: result.error, terminalDispatchStatus },
      });
      continue;
    }

    const delaySec = resolveDispatchRetryBackoffSeconds(retriesDone);

    const errTail = result.message ?? result.error ?? "unknown";
    const nextLastReason = mergeDispatchRetryLastReason(excludeCleanerId, errTail);

    const { error: upErr } = await supabase
      .from("dispatch_retry_queue")
      .update({
        retries_done: retriesDone + 1,
        next_retry_at: addSecondsIso(delaySec),
        updated_at: new Date().toISOString(),
        last_reason: nextLastReason,
      })
      .eq("id", id);

    metrics.increment("dispatch.retry_queue.rescheduled", { bookingId, retriesDone, delaySec });

    if (upErr) {
      await reportOperationalIssue("warn", "processDispatchRetryQueue", upErr.message, { bookingId });
      out.errors++;
    }
  }

  return out;
}
