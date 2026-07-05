import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isUnknownColumnError } from "@/lib/cleaner/cleanerMeDb";
import type { CleanerServiceCapabilityColumns } from "@/lib/booking/serviceCapabilityEligibility";

/**
 * Loads capability flags for dispatch/team checks. Missing DB columns → empty map (all cleaners treated eligible).
 */
export async function loadCleanerCapabilityColumnsById(
  admin: SupabaseClient,
  cleanerIds: string[],
): Promise<{ ok: true; map: Map<string, CleanerServiceCapabilityColumns> } | { ok: false; error: string }> {
  const map = new Map<string, CleanerServiceCapabilityColumns>();
  const ids = [...new Set(cleanerIds.map((x) => String(x).trim()).filter(Boolean))];
  if (ids.length === 0) return { ok: true, map };

  const sel = "id, can_do_deep_cleaning, can_do_move_cleaning";
  const r = await admin.from("cleaners").select(sel).in("id", ids);
  if (
    r.error &&
    (isUnknownColumnError(r.error, "can_do_deep_cleaning") ||
      isUnknownColumnError(r.error, "can_do_move_cleaning"))
  ) {
    return { ok: true, map };
  }
  if (r.error) {
    return { ok: false, error: r.error.message };
  }
  for (const raw of r.data ?? []) {
    const row = raw as {
      id?: string;
      can_do_deep_cleaning?: boolean | null;
      can_do_move_cleaning?: boolean | null;
    };
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    map.set(id, {
      can_do_deep_cleaning: row.can_do_deep_cleaning,
      can_do_move_cleaning: row.can_do_move_cleaning,
    });
  }
  return { ok: true, map };
}
