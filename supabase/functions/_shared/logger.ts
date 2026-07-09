import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./supabaseAdmin.ts";

export type LogLevel = "info" | "warn" | "error";

export async function logSystemEvent(params: {
  level: LogLevel;
  source: string;
  message: string;
  context?: Record<string, unknown>;
  admin?: SupabaseClient;
}): Promise<void> {
  try {
    const supabase = params.admin ?? getSupabaseAdmin();
    const { error } = await supabase.from("system_logs").insert({
      level: params.level,
      source: params.source,
      message: params.message.slice(0, 8000),
      context: params.context ?? {},
    });
    if (error) {
      console.error("[system_logs insert]", error.message, params.source);
    }
  } catch (e) {
    console.error("[system_logs]", e);
  }
}

export async function logCronRun(params: {
  jobName: string;
  status: "success" | "error" | "skipped";
  message?: string | null;
  context?: Record<string, unknown>;
  admin?: SupabaseClient;
}): Promise<void> {
  const detail = (params.message ?? "").trim().slice(0, 8000);
  const dbStatus = params.status === "skipped" ? "success" : params.status;

  await logSystemEvent({
    level: params.status === "error" ? "error" : "info",
    source: "cron_run",
    message: params.jobName,
    context: {
      status: params.status,
      detail: detail || undefined,
      runtime: "supabase_edge",
      ...(params.context ?? {}),
    },
    admin: params.admin,
  });

  try {
    const supabase = params.admin ?? getSupabaseAdmin();
    const { error } = await supabase.from("cron_runs").insert({
      job_name: params.jobName,
      status: dbStatus,
      message: detail ? `[edge] ${detail}` : "[edge]",
    });
    if (error) {
      console.error("[cron_runs insert]", error.message, params.jobName);
    }
  } catch (e) {
    console.error("[cron_runs]", e);
  }
}
