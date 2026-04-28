import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type DispatchControlAlertInput = {
  /** Stable category for routing (e.g. `charge_failed`, `failed_jobs_backlog`). */
  errorType: string;
  message: string;
  bookingId?: string | null;
  cleanerId?: string | null;
  /** Dedupe key for optional cooldown (e.g. `failed_jobs_backlog`). */
  dedupeKey?: string | null;
  /** Cooldown window when dedupeKey is set (default 15 minutes). */
  dedupeWindowMinutes?: number;
  extra?: Record<string, unknown>;
};

/**
 * POST structured JSON to `DISPATCH_ALERT_WEBHOOK_CRITICAL_URL` when set.
 * When `dedupeKey` is set and Supabase admin is provided, skips if an identical
 * dedupe row was logged in the cooldown window (avoids cron spam).
 */
export async function postDispatchControlAlert(
  input: DispatchControlAlertInput,
  opts?: { supabase?: SupabaseClient | null },
): Promise<void> {
  const url = process.env.DISPATCH_ALERT_WEBHOOK_CRITICAL_URL?.trim();
  if (!url) return;

  const dedupeKey = input.dedupeKey?.trim() || null;
  const windowMin = input.dedupeWindowMinutes ?? 15;
  const admin = opts?.supabase ?? null;

  if (dedupeKey && admin) {
    const since = new Date(Date.now() - windowMin * 60_000).toISOString();
    const { data, error } = await admin
      .from("system_logs")
      .select("id")
      .eq("source", "dispatch_control_webhook_sent")
      .eq("context->>dedupeKey", dedupeKey)
      .gte("created_at", since)
      .limit(1);
    if (!error && (data?.length ?? 0) > 0) return;
  }

  const timestamp = new Date().toISOString();
  const body = {
    timestamp,
    error_type: input.errorType,
    message: input.message,
    booking_id: input.bookingId ?? null,
    cleaner_id: input.cleanerId ?? null,
    ...(input.extra && Object.keys(input.extra).length ? { context: input.extra } : {}),
  };

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
  } catch {
    /* channel down */
  } finally {
    clearTimeout(t);
  }

  const logClient = admin ?? getSupabaseAdmin();
  if (dedupeKey && logClient) {
    try {
      await logClient.from("system_logs").insert({
        level: "info",
        source: "dispatch_control_webhook_sent",
        message: `dispatch_control_webhook:${input.errorType}`,
        context: {
          dedupeKey,
          errorType: input.errorType,
          bookingId: input.bookingId ?? undefined,
          cleanerId: input.cleanerId ?? undefined,
        },
      });
    } catch {
      /* dedupe log is best-effort */
    }
  }
}
