import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "./logger.ts";

export const CRON_LOCK_KEYS = {
  whatsappWorker: "whatsapp-worker",
  dispatchTimeouts: "dispatch-timeouts",
  retryBookingJobs: "retry-booking-jobs",
  retryDispatch: "retry-dispatch",
  retryNotifications: "retry-notifications",
  retryPaymentJobs: "retry-payment-jobs",
} as const;

export type CronLockAcquireResult =
  | { ok: true; jobName: string; holderId: string; leaseSeconds: number; degraded?: false }
  | { ok: true; jobName: string; holderId: string; leaseSeconds: number; degraded: true; error: string }
  | { ok: false; reason: "concurrent_run"; jobName: string };

function clampLeaseSeconds(input: unknown): number {
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return 600;
  return Math.max(30, Math.min(3600, Math.round(n)));
}

function newHolderId(): string {
  return crypto.randomUUID();
}

export async function acquireCronLock(
  admin: SupabaseClient,
  jobName: string,
  leaseSeconds = 600,
): Promise<CronLockAcquireResult> {
  const j = String(jobName ?? "").trim();
  if (!j) return { ok: false, reason: "concurrent_run", jobName: j };

  const lease = clampLeaseSeconds(leaseSeconds);
  const holderId = newHolderId();

  const { data, error } = await admin.rpc("try_acquire_cron_lock", {
    p_job_name: j,
    p_holder_id: holderId,
    p_lease_seconds: lease,
  });

  if (error) {
    void logSystemEvent({
      level: "warn",
      source: "edge/cronLock/acquire",
      message: error.message,
      context: { jobName: j },
      admin,
    });
    return { ok: true, jobName: j, holderId, leaseSeconds: lease, degraded: true, error: error.message };
  }

  if (data === true) {
    return { ok: true, jobName: j, holderId, leaseSeconds: lease };
  }
  return { ok: false, reason: "concurrent_run", jobName: j };
}

export async function releaseCronLock(
  admin: SupabaseClient,
  jobName: string,
  holderId: string,
): Promise<void> {
  const j = String(jobName ?? "").trim();
  const h = String(holderId ?? "").trim();
  if (!j || !h) return;

  const { error } = await admin.rpc("release_cron_lock", { p_job_name: j, p_holder_id: h });
  if (error) {
    void logSystemEvent({
      level: "warn",
      source: "edge/cronLock/release",
      message: error.message,
      context: { jobName: j },
      admin,
    });
  }
}

export async function withCronLock<T>(
  admin: SupabaseClient,
  jobName: string,
  fn: () => Promise<T>,
  leaseSeconds = 600,
): Promise<{ skipped: boolean; reason?: string; result?: T; degraded?: boolean }> {
  const acq = await acquireCronLock(admin, jobName, leaseSeconds);
  if (!acq.ok) {
    return { skipped: true, reason: "concurrent_run" };
  }

  try {
    const result = await fn();
    return { skipped: false, result, ...(acq.degraded ? { degraded: true } : {}) };
  } finally {
    if (!acq.degraded) {
      await releaseCronLock(admin, acq.jobName, acq.holderId);
    }
  }
}
