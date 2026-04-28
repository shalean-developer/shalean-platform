import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueDispatchRetry } from "@/lib/dispatch/dispatchRetryQueue";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { metrics } from "@/lib/metrics/counters";
import { notifyBookingEvent } from "@/lib/notifications/notifyBookingEvent";
import { postDispatchControlAlert } from "@/lib/ops/dispatchControlWebhook";

const DEFAULT_SLA_MIN = 10;

function effectivePendingClockIso(row: {
  became_pending_at?: string | null;
  created_at?: string | null;
}): string | null {
  const b = row.became_pending_at?.trim();
  if (b) return b;
  const c = row.created_at?.trim();
  return c && c.length > 0 ? c : null;
}

/**
 * Pending paid bookings still without a cleaner after DISPATCH_SLA_BREACH_MINUTES (default 10):
 * metrics, `reportOperationalIssue` → stderr + system_logs, and enqueue dispatch retry (deduped).
 *
 * Clock: `became_pending_at` (set on transition into pending); falls back to `created_at` if null.
 * DB index: `idx_bookings_pending_sla` (partial on became_pending_at for pending + funnel statuses).
 */
export async function reportPendingBookingSlaBreaches(
  supabase: SupabaseClient,
): Promise<{ breachCount: number; bookingIds: string[]; minutes: number }> {
  const raw = Number(process.env.DISPATCH_SLA_BREACH_MINUTES ?? DEFAULT_SLA_MIN);
  const minutes = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_SLA_MIN;
  const cutoffMs = Date.now() - minutes * 60_000;

  const { data, error } = await supabase
    .from("bookings")
    .select("id, dispatch_status, created_at, became_pending_at")
    .eq("status", "pending")
    .is("cleaner_id", null)
    .in("dispatch_status", ["searching", "offered"])
    .limit(80);

  if (error) {
    await reportOperationalIssue("error", "dispatch_sla_watchdog_query", `SLA query failed: ${error.message}`, {});
    return { breachCount: 0, bookingIds: [], minutes };
  }

  const bookingIds = (data ?? [])
    .map((r) => {
      const id = String((r as { id?: string }).id ?? "");
      const eff = effectivePendingClockIso(r as { became_pending_at?: string | null; created_at?: string | null });
      if (!id || !eff) return null;
      const t = new Date(eff).getTime();
      if (!Number.isFinite(t) || t >= cutoffMs) return null;
      return id;
    })
    .filter((id): id is string => id != null)
    .slice(0, 50);

  for (const bookingId of bookingIds) {
    metrics.increment("dispatch.unassigned.sla_breach", { bookingId, minutes });
    await enqueueDispatchRetry(supabase, bookingId, "sla_watchdog");
  }

  if (bookingIds.length) {
    await reportOperationalIssue(
      "warn",
      "dispatch_sla_watchdog",
      `${bookingIds.length} booking(s) pending without cleaner past SLA (${minutes}m, clock=became_pending_at|created_at)`,
      { bookingIds, minutes, errorType: "dispatch_unassigned_past_sla" },
    );
    const bucket = Math.floor(Date.now() / (15 * 60_000));
    await postDispatchControlAlert(
      {
        errorType: "dispatch_unassigned_past_sla",
        message: `${bookingIds.length} pending booking(s) without cleaner past ${minutes}m SLA`,
        bookingId: bookingIds[0],
        dedupeKey: `dispatch_sla_webhook:${bucket}:${minutes}`,
        dedupeWindowMinutes: 14,
        extra: { bookingIds, minutes },
      },
      { supabase },
    );
    try {
      await notifyBookingEvent({ type: "sla_breach", supabase, bookingIds, minutes });
    } catch (e) {
      await reportOperationalIssue("error", "dispatch_sla_watchdog/notify", String(e), { bookingIds, minutes });
    }
  }

  return { breachCount: bookingIds.length, bookingIds, minutes };
}
