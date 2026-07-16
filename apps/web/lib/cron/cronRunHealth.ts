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
 * Temporary Hobby-compatible Vercel schedule (once daily ~02:00 UTC).
 * Not equivalent to the intended five-minute production cadence.
 */
export const BOOKING_LIFECYCLE_HOBBY_SCHEDULE = "0 2 * * *";

/**
 * Deferred Pro / equivalent schedule — restore only after PRE-CRON-PRO-01 gates.
 * Must not be enabled in vercel.json while the team remains on Hobby.
 */
export const BOOKING_LIFECYCLE_PRO_SCHEDULE = "*/5 * * * *";

export const BOOKING_LIFECYCLE_STALE_AFTER_MINUTES = {
  /** Local / unit / manual-test feedback window */
  localOrManual: 30,
  /**
   * Staging Hobby once-daily: >24h expected gap + Hobby hour-window imprecision.
   * Suggested: more than 26 hours since last expected success.
   */
  hobbyDaily: 26 * 60,
  /** Future Pro five-minute cadence (PRE-CRON-PRO-01) */
  proFiveMinute: 30,
} as const;

/**
 * Environment-aware stale threshold for booking-lifecycle cron health.
 * Staging/preview on Hobby daily must not false-alarm after 30 minutes.
 */
export function resolveBookingLifecycleCronStaleAfterMinutes(
  environment?: string,
): number {
  const env = (environment ?? "").trim().toLowerCase();
  if (env === "staging" || env === "preview") {
    return BOOKING_LIFECYCLE_STALE_AFTER_MINUTES.hobbyDaily;
  }
  return BOOKING_LIFECYCLE_STALE_AFTER_MINUTES.localOrManual;
}

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
  const env = params.environment ?? "unknown";
  const staleAfterMinutes =
    params.staleAfterMinutes ?? resolveBookingLifecycleCronStaleAfterMinutes(env);
  const now = params.nowMs ?? Date.now();

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

  const environment = opts?.environment ?? "unknown";
  const staleAfterMinutes =
    opts?.staleAfterMinutes ?? resolveBookingLifecycleCronStaleAfterMinutes(environment);

  if (error) {
    return {
      jobName,
      status: "never_run",
      lastInvokedAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastStatus: null,
      lastMessage: `query_error:${error.message.slice(0, 120)}`,
      staleAfterMinutes,
      environment,
    };
  }

  return classifyCronRunHealth({
    jobName,
    rows: (data ?? []) as CronRunRow[],
    lockHeld: opts?.lockHeld,
    staleAfterMinutes,
    environment,
  });
}
