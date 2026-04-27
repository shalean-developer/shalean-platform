import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyDispatchEscalationAdmin } from "@/lib/dispatch/dispatchEscalation";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { metrics } from "@/lib/metrics/counters";

/** Minutes after failure before each retry wave (cron-compatible). */
export const DISPATCH_RETRY_DELAYS_MIN = [2, 5, 10, 15] as const;

function addMinutesIso(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
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

/**
 * Queue a paid booking for a later auto-assign attempt (no duplicate pending rows).
 */
export async function enqueueDispatchRetry(
  supabase: SupabaseClient,
  bookingId: string,
  reason?: string,
): Promise<void> {
  const { data: pending } = await supabase
    .from("dispatch_retry_queue")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("status", "pending")
    .maybeSingle();

  if (pending) return;

  const firstDelay = await resolveAdaptiveFirstRetryDelayMin(supabase);
  const { error } = await supabase.from("dispatch_retry_queue").insert({
    booking_id: bookingId,
    retries_done: 0,
    next_retry_at: addMinutesIso(firstDelay),
    status: "pending",
    last_reason: reason ?? null,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    await reportOperationalIssue("warn", "enqueueDispatchRetry", error.message, { bookingId });
  }
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

      await supabase
        .from("bookings")
        .update({ dispatch_status: "unassignable" })
        .eq("id", bookingId)
        .eq("status", "pending")
        .is("cleaner_id", null);

      metrics.increment("dispatch.unassignable", {
        bookingId,
        error: result.error,
        message: result.message ?? null,
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
        message: "Dispatch retries exhausted — booking dispatch_status=unassignable",
        context: { bookingId, error: result.error },
      });
      continue;
    }

    const nextDelayMin = DISPATCH_RETRY_DELAYS_MIN[retriesDone + 1];
    const delay = nextDelayMin ?? 15;

    const { error: upErr } = await supabase
      .from("dispatch_retry_queue")
      .update({
        retries_done: retriesDone + 1,
        next_retry_at: addMinutesIso(delay),
        updated_at: new Date().toISOString(),
        last_reason: result.message ?? result.error,
      })
      .eq("id", id);

    if (upErr) {
      await reportOperationalIssue("warn", "processDispatchRetryQueue", upErr.message, { bookingId });
      out.errors++;
    }
  }

  return out;
}
