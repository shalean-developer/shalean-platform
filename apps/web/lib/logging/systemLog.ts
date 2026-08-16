import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { postDispatchControlAlert } from "@/lib/ops/dispatchControlWebhook";
import { redactOperationalContext } from "@/lib/logging/redactOperationalContext";

export type SystemLogLevel = "error" | "warn" | "info";

/** Operational severity; `critical` is stored in DB as `error` with a `[CRITICAL]` prefix (system_logs.level check). */
export type OperationalIssueLevel = "error" | "warn" | "critical";

/**
 * Persists a row to `system_logs` when Supabase is configured. Never throws.
 *
 * Optional `context` keys used by notification pipeline: `eventTriggeredAtIso`, `pipelineLatencyMs`
 * (ms from trigger to log write; compare with row `created_at` for end-to-end delivery latency).
 */
/**
 * Persists every cron run to `cron_runs` for health/recency monitoring.
 * Only error runs are mirrored into `system_logs`; successful idle ticks stay out of the
 * high-volume operational event table. Safe to call from cron routes; never throws.
 */
export async function logCronRun(params: {
  jobName: string;
  status: "success" | "error";
  message?: string | null;
  context?: Record<string, unknown>;
}): Promise<void> {
  const detail = (params.message ?? "").trim().slice(0, 8000);
  try {
    if (params.status === "error") {
      await logSystemEvent({
        level: "error",
        source: "cron_run",
        message: params.jobName,
        context: {
          status: params.status,
          detail: detail || undefined,
          ...(params.context ?? {}),
        },
      });
    }
    const supabase = getSupabaseAdmin();
    if (!supabase) return;
    const { error } = await supabase.from("cron_runs").insert({
      job_name: params.jobName,
      status: params.status,
      message: detail || null,
    });
    if (error) {
      console.error("[cron_runs insert]", error.message, params.jobName);
    }
  } catch (e) {
    console.error("[cron_runs]", e);
  }
}

export async function logSystemEvent(params: {
  level: SystemLogLevel;
  source: string;
  message: string;
  context?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      console.warn("[system_logs]", params.level, params.source, params.message, redactOperationalContext(params.context) ?? "");
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

  const consoleCtx = redactOperationalContext(context);
  if (level === "warn") {
    console.warn(`[${source}]`, message, consoleCtx ?? "");
  } else {
    console.error(`[${source}]`, persistMessage, consoleCtx ?? "");
  }

  await logSystemEvent({
    level: isCritical ? "error" : level,
    source,
    message: persistMessage,
    context: persistContext,
  });

  if (isCritical) {
    const ctx = persistContext ?? {};
    const errorType =
      typeof ctx.errorType === "string"
        ? ctx.errorType
        : typeof ctx.error_type === "string"
          ? ctx.error_type
          : "critical_operational";
    const bookingIdRaw = ctx.bookingId ?? ctx.booking_id;
    const cleanerIdRaw = ctx.cleanerId ?? ctx.cleaner_id;
    const bookingId = typeof bookingIdRaw === "string" ? bookingIdRaw : null;
    const cleanerId = typeof cleanerIdRaw === "string" ? cleanerIdRaw : null;
    await postDispatchControlAlert({
      errorType,
      message: persistMessage,
      bookingId,
      cleanerId,
      extra: redactOperationalContext(ctx as Record<string, unknown>),
    });
  }
}
