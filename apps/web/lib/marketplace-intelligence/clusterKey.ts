import { createHash } from "crypto";

/**
 * Deterministic cluster id for a booking (same location + same hour bucket → same cluster).
 * Used for dispatch affinity and route batching without loading all day bookings.
 */
export function deriveMarketplaceClusterId(dateYmd: string, timeHm: string, locationId: string): string {
  const hm = String(timeHm).trim().slice(0, 5);
  const hour = hm.length >= 2 ? hm.slice(0, 2) : "00";
  const raw = `${dateYmd}|${hour}|${locationId}`;
  const h = createHash("sha256").update(raw).digest("hex").slice(0, 16);
  return `mi_c_${h}`;
}
