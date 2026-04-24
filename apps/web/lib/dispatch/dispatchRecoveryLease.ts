import type { SupabaseClient } from "@supabase/supabase-js";
import { parseLeaseClaimRpcResult } from "@/lib/dispatch/parseLeaseClaimRpcResult";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { metrics } from "@/lib/metrics/counters";

/** Short TTL so a crashed worker does not block recovery for long (target 60–120s). */
export const DEFAULT_DISPATCH_RECOVERY_LEASE_SECONDS = 90;

export function clampDispatchRecoveryLeaseSeconds(requested: number): number {
  const n = Number.isFinite(requested) ? Math.floor(requested) : DEFAULT_DISPATCH_RECOVERY_LEASE_SECONDS;
  return Math.min(120, Math.max(60, n));
}

/**
 * Atomically take a short processing lease (Postgres `now()` for compare + lease end).
 * Avoids app↔DB clock drift vs client-generated timestamps. Steals when lease is null or expired.
 *
 * RPC return shape: see `parseLeaseClaimRpcResult` (boolean legacy vs jsonb). Optional env:
 * `DISPATCH_LEASE_RPC_FORCE_LEGACY=true` — boolean-only parsing during mixed deploy.
 */
export async function tryClaimDispatchRecoveryLease(
  supabase: SupabaseClient,
  bookingId: string,
  opts: { leaseSeconds: number },
): Promise<boolean> {
  const ttl = clampDispatchRecoveryLeaseSeconds(opts.leaseSeconds);
  const { data, error } = await supabase.rpc("claim_booking_dispatch_recovery_lease", {
    p_booking_id: bookingId,
    p_lease_seconds: ttl,
  });

  if (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[tryClaimDispatchRecoveryLease] rpc failed", error.message);
    }
    return false;
  }

  const parsed = parseLeaseClaimRpcResult(data);
  if (!parsed?.claimed) {
    return false;
  }

  if (parsed.stoleExpiredLease) {
    void logSystemEvent({
      level: "info",
      source: "dispatch_recovery_lease_stolen",
      message: "Recovery lease taken after prior lease expired (crash-safe TTL)",
      context: { bookingId, lease_seconds: ttl },
    });
    metrics.increment("dispatch.lease.stolen", { bookingId });
  }

  return true;
}

export async function releaseDispatchRecoveryLease(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<void> {
  await supabase.from("bookings").update({ dispatch_recovery_lease_until: null }).eq("id", bookingId);
}
