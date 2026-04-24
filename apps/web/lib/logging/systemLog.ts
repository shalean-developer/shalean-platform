import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type SystemLogLevel = "error" | "warn" | "info";

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
  level: "error" | "warn",
  source: string,
  message: string,
  context?: Record<string, unknown>,
): Promise<void> {
  if (level === "error") {
    console.error(`[${source}]`, message, context ?? "");
  } else {
    console.warn(`[${source}]`, message, context ?? "");
  }
  await logSystemEvent({ level, source, message, context });
}
