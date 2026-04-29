import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Location UUIDs where at least one non-offline cleaner works
 * (`cleaner_locations` or legacy `cleaners.location_id`).
 */
export async function collectLocationIdsWithActiveCleaners(admin: SupabaseClient): Promise<Set<string>> {
  const ids = new Set<string>();
  const { data: cleaners, error } = await admin.from("cleaners").select("id, location_id, status");
  if (error || !cleaners?.length) return ids;

  const activeIds = new Set<string>();
  for (const c of cleaners as { id: string; location_id?: string | null; status?: string | null }[]) {
    if (String(c.status ?? "").toLowerCase() === "offline") continue;
    activeIds.add(String(c.id));
    const lid = c.location_id ? String(c.location_id).trim().toLowerCase() : "";
    if (lid) ids.add(lid);
  }

  const { data: pairs, error: e2 } = await admin.from("cleaner_locations").select("cleaner_id, location_id");
  if (!e2 && pairs?.length) {
    for (const p of pairs as { cleaner_id: string; location_id: string }[]) {
      if (!activeIds.has(String(p.cleaner_id))) continue;
      const lid = String(p.location_id ?? "").trim().toLowerCase();
      if (lid) ids.add(lid);
    }
  }

  return ids;
}
