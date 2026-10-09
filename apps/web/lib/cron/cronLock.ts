import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { reportOperationalIssue } from "@/lib/logging/systemLog";

/**
 * H-15: per-job cron concurrency lock.
 *
 * Wraps a cron route's work in a database-backed lease so two runners (e.g. Vercel cron
 * + Supabase pg_cron) cannot process the same financial / recurring / payout / assignment /
 * booking job at the same time.
 *
 * Lease semantics (see `supabase/migrations/20260941_cron_run_leases.sql`):
 * - `try_acquire_cron_lock` is atomic: at most one runner per `job_name` holds an unexpired
 *   lease at a time.
 * - If the holding runner crashes without releasing, the lease auto-expires after
 *   `leaseSeconds`, and the next runner can claim it. **Important: pick `leaseSeconds`
 *   large enough to cover the worst-case run; default 600s.**
 * - `release_cron_lock` is owner-checked: a release with the wrong `holder_id` is a no-op,
 *   so a stuck runner that wakes up after the lease expired and a new runner has claimed
 *   it cannot accidentally release the new runner's lease.
 *
 * Failure-mode policy: if the *acquire* RPC errors, we fail-open and run the work anyway —
 * the goal of H-15 is to prevent overlap when the lock infrastructure is healthy, not to
 * introduce a new dependency that can DOS all financial cron jobs if Supabase blips.
 */

export type CronLockAcquireResult =
  | { ok: true; jobName: string; holderId: string; leaseSeconds: number; degraded?: false }
  /** Lock RPC errored — run the work anyway so we don't introduce a new outage vector. */
  | { ok: true; jobName: string; holderId: string; leaseSeconds: number; degraded: true; error: string }
  | { ok: false; reason: "concurrent_run"; jobName: string };

export type CronLockJobOptions = {
  jobName: string;
  /** Lease TTL in seconds. Clamped to [30, 3600] by the RPC. Default 600. */
  leaseSeconds?: number;
};

/**
 * Acquire a lease for `jobName`. Returns `{ ok: false, reason: "concurrent_run" }` if another
 * runner currently holds an unexpired lease — in that case the caller MUST short-circuit
 * with a non-failing response.
 */
export async function acquireCronLock(
  admin: SupabaseClient,
  opts: CronLockJobOptions,
): Promise<CronLockAcquireResult> {
  const jobName = String(opts.jobName ?? "").trim();
  if (!jobName) {
    return { ok: false, reason: "concurrent_run", jobName };
  }
  const leaseSeconds = clampLeaseSeconds(opts.leaseSeconds);
  const holderId = newHolderId();

  const { data, error } = await admin.rpc("try_acquire_cron_lock", {
    p_job_name: jobName,
    p_holder_id: holderId,
    p_lease_seconds: leaseSeconds,
  });

  if (error) {
    void reportOperationalIssue("warn", "cronLock/acquire", error.message, { jobName });
    // Fail-open: run anyway, but mark the result so callers/tests can detect degraded mode.
    return { ok: true, jobName, holderId, leaseSeconds, degraded: true, error: error.message };
  }

  if (data === true) {
    return { ok: true, jobName, holderId, leaseSeconds };
  }
  return { ok: false, reason: "concurrent_run", jobName };
}

/**
 * Release a lease held by `holderId`. Best-effort: errors are logged but not re-thrown.
 */
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
    void reportOperationalIssue("warn", "cronLock/release", error.message, { jobName: j, holderId: h });
  }
}

export type WithCronLockSkipped = {
  ok: true;
  skipped: true;
  reason: "concurrent_run";
  jobName: string;
};
export type WithCronLockRan<T> = { ok: true; skipped: false; jobName: string; ranIt: T; degraded?: boolean };
export type WithCronLockResult<T> = WithCronLockSkipped | WithCronLockRan<T>;

/**
 * Convenience wrapper: claim the lease, run `fn`, release the lease in `finally`. If another
 * runner already holds the lease, returns `{ ok: true, skipped: true }` without invoking `fn`.
 *
 * The lease is held for the full duration of `fn`. If `fn` throws, the lease is still released
 * before the throw propagates.
 */
export async function withCronLock<T>(
  admin: SupabaseClient,
  opts: CronLockJobOptions,
  fn: () => Promise<T>,
): Promise<WithCronLockResult<T>> {
  const acq = await acquireCronLock(admin, opts);
  if (!acq.ok) {
    return { ok: true, skipped: true, reason: "concurrent_run", jobName: acq.jobName };
  }

  try {
    const ranIt = await fn();
    return {
      ok: true,
      skipped: false,
      jobName: acq.jobName,
      ranIt,
      ...(acq.degraded ? { degraded: true } : {}),
    };
  } finally {
    if (!acq.degraded) {
      // Best-effort; never throws (releaseCronLock catches its own errors).
      await releaseCronLock(admin, acq.jobName, acq.holderId);
    }
  }
}

function clampLeaseSeconds(input: unknown): number {
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return 600;
  return Math.max(30, Math.min(3600, Math.round(n)));
}

function newHolderId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  // Fallback: only used in non-Node test envs without WebCrypto.
  return [
    Math.random().toString(16).slice(2, 10),
    Math.random().toString(16).slice(2, 6),
    "4" + Math.random().toString(16).slice(2, 5),
    "8" + Math.random().toString(16).slice(2, 5),
    Math.random().toString(16).slice(2, 14),
  ].join("-");
}
