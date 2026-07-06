import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ADMIN_MAX_PREFERRED_CLEANERS } from "@/lib/admin/adminPreferredCleanerLimits";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parse admin booking-create preferred cleaner ids from POST body.
 * Accepts `selected_cleaner_ids` (array) or legacy `selected_cleaner_id` (string).
 */
export async function parseAdminSelectedCleanerIds(
  body: Record<string, unknown>,
  admin: SupabaseClient,
): Promise<string[]> {
  const rawIds: string[] = [];

  if (Array.isArray(body.selected_cleaner_ids)) {
    for (const item of body.selected_cleaner_ids) {
      if (typeof item === "string") {
        const t = item.trim().toLowerCase();
        if (t) rawIds.push(t);
      }
    }
  } else if (typeof body.selected_cleaner_id === "string") {
    const t = body.selected_cleaner_id.trim().toLowerCase();
    if (t) rawIds.push(t);
  }

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const id of rawIds) {
    if (!UUID_RE.test(id) || seen.has(id)) continue;
    seen.add(id);
    deduped.push(id);
    if (deduped.length >= ADMIN_MAX_PREFERRED_CLEANERS) break;
  }

  if (deduped.length === 0) return [];

  const validated: string[] = [];
  for (const id of deduped) {
    const { data: clRow } = await admin.from("cleaners").select("id").eq("id", id).maybeSingle();
    if (clRow && typeof (clRow as { id?: unknown }).id === "string") {
      validated.push(id);
    }
  }

  return validated;
}
