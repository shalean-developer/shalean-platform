import type { SupabaseClient } from "@supabase/supabase-js";

export type CronRunHealthStatus =
  | "never_run"
  | "currently_running"
  | "succeeded"
  | "failed"
  | "stale";

export type CronRunHealthSnapshot = {
  jobName: string;
  status: CronRunHealthStatus;
  lastInvokedAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastStatus: "success" | "error" | null;
  lastMessage: string | null;
  staleAfterMinutes: number;
  environment: string;
};

export type CronRunRow = {
  created_at: string;
  status: string;
  message?: string | null;
};

/**
 * Pure classifier for operator-facing cron health (no secrets / raw payloads).
 */
export function classifyCronRunHealth(params: {
  jobName: string;
  rows: CronRunRow[];
  /** Active lock holder present (optional). */
  lockHeld?: boolean;
  nowMs?: number;
  staleAfterMinutes?: number;
  environment?: string;
}): CronRunHealthSnapshot {
  const staleAfterMinutes = params.staleAfterMinutes ?? 30;
  const now = params.nowMs ?? Date.now();
  const env = params.environment ?? "unknown";

  const sorted = [...params.rows].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  );
  const last = sorted[0] ?? null;
  const lastSuccess = sorted.find((r) => r.status === "success") ?? null;
  const lastFailure = sorted.find((r) => r.status === "error") ?? null;

  const lastSuccessAt = lastSuccess?.created_at ?? null;
  const lastFailureAt = lastFailure?.created_at ?? null;
  const lastInvokedAt = last?.created_at ?? null;
  const lastStatus =
    last?.status === "success" || last?.status === "error" ? last.status : null;

  if (params.lockHeld) {
    return {
      jobName: params.jobName,
      status: "currently_running",
      lastInvokedAt,
      lastSuccessAt,
      lastFailureAt,
      lastStatus,
      lastMessage: sanitizeCronMessage(last?.message),
      staleAfterMinutes,
      environment: env,
    };
  }

  if (!lastInvokedAt) {
    return {
      jobName: params.jobName,
      status: "never_run",
      lastInvokedAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastStatus: null,
      lastMessage: null,
      staleAfterMinutes,
      environment: env,
    };
  }

  const latestIsError =
    lastStatus === "error" &&
    (!lastSuccessAt || Date.parse(last!.created_at) >= Date.parse(lastSuccessAt));

  if (latestIsError) {
    return {
      jobName: params.jobName,
      status: "failed",
      lastInvokedAt,
      lastSuccessAt,
      lastFailureAt,
      lastStatus,
      lastMessage: sanitizeCronMessage(last?.message),
      staleAfterMinutes,
      environment: env,
    };
  }

  const successAgeMs = lastSuccessAt ? now - Date.parse(lastSuccessAt) : Number.POSITIVE_INFINITY;
  if (!lastSuccessAt || successAgeMs > staleAfterMinutes * 60_000) {
    return {
      jobName: params.jobName,
      status: "stale",
      lastInvokedAt,
      lastSuccessAt,
      lastFailureAt,
      lastStatus,
      lastMessage: sanitizeCronMessage(last?.message),
      staleAfterMinutes,
      environment: env,
    };
  }

  return {
    jobName: params.jobName,
    status: "succeeded",
    lastInvokedAt,
    lastSuccessAt,
    lastFailureAt,
    lastStatus,
    lastMessage: sanitizeCronMessage(last?.message),
    staleAfterMinutes,
    environment: env,
  };
}

function sanitizeCronMessage(message: string | null | undefined): string | null {
  if (!message) return null;
  return message
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/CRON_SECRET[=:]\s*\S+/gi, "CRON_SECRET=[redacted]")
    .slice(0, 500);
}

export async function fetchCronRunHealth(
  admin: SupabaseClient,
  jobName: string,
  opts?: { staleAfterMinutes?: number; environment?: string; lockHeld?: boolean },
): Promise<CronRunHealthSnapshot> {
  const { data, error } = await admin
    .from("cron_runs")
    .select("created_at, status, message")
    .eq("job_name", jobName)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return {
      jobName,
      status: "never_run",
      lastInvokedAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastStatus: null,
      lastMessage: `query_error:${error.message.slice(0, 120)}`,
      staleAfterMinutes: opts?.staleAfterMinutes ?? 30,
      environment: opts?.environment ?? "unknown",
    };
  }

  return classifyCronRunHealth({
    jobName,
    rows: (data ?? []) as CronRunRow[],
    lockHeld: opts?.lockHeld,
    staleAfterMinutes: opts?.staleAfterMinutes,
    environment: opts?.environment,
  });
}
