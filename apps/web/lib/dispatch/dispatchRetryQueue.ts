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

/** Matches `public.enqueue_stranded_pending_bookings` scan window (SQL caps `p_limit` at 200). */
const STRANDED_SCAN_LIMIT = 200;
/** Matches default `p_limit` in `public.enqueue_stranded_pending_bookings(50)`. */
const STRANDED_ENQUEUE_CAP = 50;

/**
 * Port of `public.enqueue_stranded_pending_bookings`: pending paid bookings with no cleaner, no pending
 * offer, no pending retry row — enqueue `dispatch_retry_queue` with `last_reason = stranded_pending`
 * so `processDispatchRetryQueue` can assign. Idempotent via {@link enqueueDispatchRetry}.
 */
export async function enqueueStrandedBookings(supabase: SupabaseClient): Promise<number> {
  const { data: candidates, error } = await supabase
    .from("bookings")
    .select("id, created_at")
    .eq("status", "pending")
    .is("cleaner_id", null)
    .not("location_id", "is", null)
    .in("dispatch_status", ["searching", "offered", "failed"])
    .order("created_at", { ascending: true })
    .limit(STRANDED_SCAN_LIMIT);

  if (error) {
    await reportOperationalIssue("warn", "enqueueStrandedBookings/select", error.message, {});
    return 0;
  }

  const rows = candidates ?? [];
  if (rows.length === 0) return 0;

  const ids = rows.map((r) => String((r as { id: string }).id)).filter(Boolean);
  if (ids.length === 0) return 0;

  const [{ data: pendingOffers }, { data: pendingRetries }] = await Promise.all([
    supabase.from("dispatch_offers").select("booking_id").eq("status", "pending").in("booking_id", ids),
    supabase.from("dispatch_retry_queue").select("booking_id").eq("status", "pending").in("booking_id", ids),
  ]);

  const offerBusy = new Set(
    (pendingOffers ?? []).map((o) => String((o as { booking_id?: string }).booking_id ?? "")).filter(Boolean),
  );
  const retryBusy = new Set(
    (pendingRetries ?? []).map((q) => String((q as { booking_id?: string }).booking_id ?? "")).filter(Boolean),
  );

  const sorted = [...rows].sort((a, b) => {
    const ta = new Date(String((a as { created_at?: string }).created_at ?? "")).getTime();
    const tb = new Date(String((b as { created_at?: string }).created_at ?? "")).getTime();
    return (Number.isFinite(ta) ? ta : 0) - (Number.isFinite(tb) ? tb : 0);
  });

  let enqueued = 0;
  for (const row of sorted) {
    if (enqueued >= STRANDED_ENQUEUE_CAP) break;
    const bookingId = String((row as { id: string }).id);
    if (!bookingId || offerBusy.has(bookingId) || retryBusy.has(bookingId)) continue;

    const inserted = await enqueueDispatchRetry(supabase, bookingId, "stranded_pending", { firstDelaySeconds: 1 });
    if (inserted) {
      enqueued++;
      retryBusy.add(bookingId);
    }
  }

  if (enqueued > 0) {
    metrics.increment("dispatch.stranded.enqueued", { count: enqueued });
    console.log("[Dispatch] stranded bookings enqueued", enqueued);
  }

  return enqueued;
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
