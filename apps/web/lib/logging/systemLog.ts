import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type SystemLogLevel = "error" | "warn" | "info";

/** Operational severity; `critical` is stored in DB as `error` with a `[CRITICAL]` prefix (system_logs.level check). */
export type OperationalIssueLevel = "error" | "warn" | "critical";

/**
 * Persists a row to `system_logs` when Supabase is configured. Never throws.
 *
 * Optional `context` keys used by notification pipeline: `eventTriggeredAtIso`, `pipelineLatencyMs`
 * (ms from trigger to log write; compare with row `created_at` for end-to-end delivery latency).
 */
export async function logSystemEvent(params: {
  level: SystemLogLevel;
  source: string;
  message: string;
  context?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      console.warn("[system_logs]", params.level, params.source, params.message, params.context ?? "");
      return;
    }
    const { error } = await supabase.from("system_logs").insert({
      level: params.level,
      source: params.source,
      message: params.message.slice(0, 8000),
      context: params.context ?? {},
    });
    if (error) {
      console.error("[system_logs insert]", error.message, params.source, params.message);
    }
  } catch (e) {
    console.error("[system_logs]", e);
  }
}

/**
 * Standard path for server failures: stderr (host logs) + `system_logs` (when DB available).
 */
export async function reportOperationalIssue(
  level: OperationalIssueLevel,
  source: string,
  message: string,
  context?: Record<string, unknown>,
): Promise<void> {
  const isCritical = level === "critical";
  const persistMessage = isCritical ? `[CRITICAL] ${message}` : message;
  const persistContext =
    isCritical ? { ...context, operationalSeverity: "critical" as const } : context;

  if (level === "warn") {
    console.warn(`[${source}]`, message, context ?? "");
  } else {
    console.error(`[${source}]`, persistMessage, context ?? "");
  }

  await logSystemEvent({
    level: isCritical ? "error" : level,
    source,
    message: persistMessage,
    context: persistContext,
  });

  if (isCritical) {
    await dispatchCriticalAlertWebhook(persistMessage, persistContext);
  }
}

/**
 * Optional outbound alert for critical operational issues. Never throws.
 * Env: `DISPATCH_ALERT_WEBHOOK_CRITICAL_URL` — POST JSON `{ message, context, timestamp }`.
 */
async function dispatchCriticalAlertWebhook(
  message: string,
  context: Record<string, unknown> | undefined,
): Promise<void> {
  const url = process.env.DISPATCH_ALERT_WEBHOOK_CRITICAL_URL?.trim();
  if (!url) return;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        context: context ?? {},
        timestamp: new Date().toISOString(),
      }),
      signal: ac.signal,
    });
  } catch {
    /* alert channel down — do not affect request path */
  } finally {
    clearTimeout(t);
  }
}
