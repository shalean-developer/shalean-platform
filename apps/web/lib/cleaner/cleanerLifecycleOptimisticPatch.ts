import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";

export type CleanerLifecycleOptimisticAction = "accept" | "en_route" | "start" | "complete";

type PatchableRow = Partial<CleanerBookingRow> & Record<string, unknown>;

/**
 * Minimal row patch after a successful lifecycle POST so dashboard / detail UIs
 * advance labels immediately before the server refresh lands.
 */
export function optimisticPatchForLifecycleAction(
  action: CleanerLifecycleOptimisticAction,
  base: PatchableRow | null | undefined,
): PatchableRow {
  const now = new Date().toISOString();
  switch (action) {
    case "accept": {
      const cur = String(base?.status ?? "").toLowerCase();
      const dst = String(base?.dispatch_status ?? "").trim().toLowerCase();
      const patch: PatchableRow = { cleaner_response_status: CLEANER_RESPONSE.ACCEPTED };
      if (cur === "pending_payment") {
        return { ...patch, accepted_at: now };
      }
      if (cur === "offered" || cur === "confirmed") patch.status = "assigned";
      if (dst === "offered") patch.dispatch_status = "assigned";
      return patch;
    }
    case "en_route":
      return { en_route_at: now, cleaner_response_status: CLEANER_RESPONSE.ON_MY_WAY };
    case "start":
      return {
        status: "in_progress",
        started_at: now,
        cleaner_response_status: CLEANER_RESPONSE.STARTED,
      };
    case "complete":
      return {
        status: "completed",
        completed_at: now,
        cleaner_response_status: CLEANER_RESPONSE.COMPLETED,
      };
    default:
      return {};
  }
}
