/**
 * Rolling-deploy safe parsing for `claim_booking_dispatch_recovery_lease`:
 * - New DB: jsonb `{ claimed, stole_expired_lease }` (or stringified JSON)
 * - Old DB during rollout: boolean
 *
 * Set `DISPATCH_LEASE_RPC_FORCE_LEGACY=true` to only accept boolean (new app + old RPC).
 */
export type LeaseClaimParse = {
  claimed: boolean;
  stoleExpiredLease: boolean;
};

export function parseLeaseClaimRpcResult(data: unknown): LeaseClaimParse | null {
  const forceLegacy = process.env.DISPATCH_LEASE_RPC_FORCE_LEGACY === "true";
  if (forceLegacy) {
    if (data === true) return { claimed: true, stoleExpiredLease: false };
    if (data === false) return { claimed: false, stoleExpiredLease: false };
    return null;
  }

  if (data === true || data === false) {
    return { claimed: data === true, stoleExpiredLease: false };
  }

  let raw: unknown = data;
  if (typeof data === "string") {
    try {
      raw = JSON.parse(data) as unknown;
    } catch {
      return null;
    }
  }

  if (!raw || typeof raw !== "object") return null;
  const o = raw as { claimed?: unknown; stole_expired_lease?: unknown };
  if (o.claimed === true) {
    return {
      claimed: true,
      stoleExpiredLease: o.stole_expired_lease === true,
    };
  }
  if (o.claimed === false) {
    return { claimed: false, stoleExpiredLease: false };
  }
  return null;
}
