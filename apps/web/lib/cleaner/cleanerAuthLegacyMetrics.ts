import "server-only";

import { metrics } from "@/lib/metrics/counters";

const lastLegacyRowMatchLogByAuthUser = new Map<string, number>();
const LEGACY_ROW_MATCH_LOG_COOLDOWN_MS = 60_000;

/** Rate-limits warn logs for `cleaners.id = auth uid` fallback (noise control). */
export function shouldEmitLegacyRowMatchLog(authUserId: string): boolean {
  const now = Date.now();
  const prev = lastLegacyRowMatchLogByAuthUser.get(authUserId) ?? 0;
  if (now - prev < LEGACY_ROW_MATCH_LOG_COOLDOWN_MS) return false;
  lastLegacyRowMatchLogByAuthUser.set(authUserId, now);
  if (lastLegacyRowMatchLogByAuthUser.size > 5000) {
    const cutoff = now - LEGACY_ROW_MATCH_LOG_COOLDOWN_MS * 2;
    for (const [k, t] of lastLegacyRowMatchLogByAuthUser) {
      if (t < cutoff) lastLegacyRowMatchLogByAuthUser.delete(k);
    }
  }
  return true;
}

/** One line per request for log drains / daily rollups (kind distinguishes header vs row fallback). */
export function recordLegacyCleanerAuthMetric(
  kind: "x_cleaner_id_header" | "legacy_id_row_match",
  fields: Record<string, string>,
): void {
  metrics.increment("legacy_cleaner_auth_used_count", { kind, ...fields });
}
