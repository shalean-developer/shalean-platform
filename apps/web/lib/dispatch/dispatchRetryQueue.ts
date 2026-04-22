import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyDispatchEscalationAdmin } from "@/lib/dispatch/dispatchEscalation";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";

/** Minutes after failure before each retry wave (cron-compatible). */
export const DISPATCH_RETRY_DELAYS_MIN = [2, 5, 10, 15] as const;

function addMinutesIso(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
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

  const firstDelay = DISPATCH_RETRY_DELAYS_MIN[0] ?? 2;
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
 * Invoked from cron: process due rows, call assignCleanerToBooking, reschedule or close.
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

  const { assignCleanerToBooking } = await import("@/lib/dispatch/assignCleaner");

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

    const result = await assignCleanerToBooking(supabase, bookingId, { retryEscalation: retriesDone });

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
      await logSystemEvent({
        level: "warn",
        source: "dispatch_retry_abandoned",
        message: "Dispatch retries exhausted (v4 escalation)",
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
