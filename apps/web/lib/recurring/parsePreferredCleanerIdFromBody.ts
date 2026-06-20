import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeUuidCandidate } from "@/lib/booking/userSelectedCleanerFromSnapshot";

export type PreferredCleanerParseResult =
  | { ok: true; value: string | null | undefined }
  | { ok: false; error: string };

/**
 * Parse `preferred_cleaner_id` from admin/customer PATCH/POST bodies.
 * - omitted / "" → undefined (no patch)
 * - null → explicit clear
 * - uuid → validated against `cleaners` when admin client supplied
 */
export async function parsePreferredCleanerIdFromBody(
  raw: unknown,
  admin?: SupabaseClient | null,
): Promise<PreferredCleanerParseResult> {
  if (raw === undefined || raw === "") return { ok: true, value: undefined };
  if (raw === null) return { ok: true, value: null };

  const id = normalizeUuidCandidate(typeof raw === "string" ? raw : null);
  if (!id) return { ok: true, value: null };

  if (admin) {
    const { data, error } = await admin.from("cleaners").select("id").eq("id", id).maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Preferred cleaner not found." };
  }

  return { ok: true, value: id };
}
