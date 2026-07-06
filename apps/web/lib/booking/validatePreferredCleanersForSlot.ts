import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ADMIN_MAX_PREFERRED_CLEANERS } from "@/lib/admin/adminPreferredCleanerLimits";
import { normalizePreferredCleanerIds } from "@/lib/booking/persistPreferredCleaners";
import { getEligibleCleaners } from "@/lib/booking/getEligibleCleaners";

export type ValidatePreferredCleanersForSlotParams = {
  admin: SupabaseClient;
  selectedCleanerIds: readonly string[];
  /** Cap selections (booking v2 `cleanerCount`). */
  maxSelect?: number;
  date: string;
  timeHm: string;
  durationMinutes: number;
  locationId: string;
  serviceType: string;
};

export type ValidatePreferredCleanersForSlotResult =
  | { ok: true; ids: string[] }
  | { ok: false; error: string };

/**
 * Validates each preferred cleaner is still eligible for the slot.
 * Returns normalized ids (deduped, capped).
 */
export async function validatePreferredCleanersForSlot(
  params: ValidatePreferredCleanersForSlotParams,
): Promise<ValidatePreferredCleanersForSlotResult> {
  const cap = Math.min(
    ADMIN_MAX_PREFERRED_CLEANERS,
    Math.max(1, params.maxSelect ?? ADMIN_MAX_PREFERRED_CLEANERS),
  );
  const ids = normalizePreferredCleanerIds(params.selectedCleanerIds).slice(0, cap);
  if (ids.length === 0) return { ok: true, ids: [] };

  for (const cleanerId of ids) {
    const pickedEligible = await getEligibleCleaners(params.admin, {
      date: params.date,
      startTime: params.timeHm,
      durationMinutes: params.durationMinutes,
      locationId: params.locationId,
      locationExpandedIds: [params.locationId],
      serviceType: params.serviceType,
      cleanerIds: [cleanerId],
      enforcePublicDailyWorkloadLimit: true,
      limit: 1,
    });
    if (pickedEligible.length === 0) {
      return {
        ok: false,
        error:
          ids.length === 1
            ? "Your selected cleaner is no longer available for this slot."
            : "One of your selected cleaners is no longer available for this slot.",
      };
    }
  }

  return { ok: true, ids };
}
