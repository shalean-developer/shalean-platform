import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeEmail } from "@/lib/booking/normalizeEmail";

export type AuthUserMatch = {
  id: string;
  email: string | null;
  /** Best-effort display name from user_metadata (not user_profiles). */
  metaDisplayName: string | null;
};

function metaDisplayNameFromUser(user: { user_metadata?: unknown }): string | null {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  if (typeof meta?.full_name === "string" && meta.full_name.trim()) return meta.full_name.trim();
  if (typeof meta?.name === "string" && String(meta.name).trim()) return String(meta.name).trim();
  return null;
}

/**
 * Paginates `auth.admin.listUsers` and returns users whose email or metadata display name
 * contains `needle` (case-insensitive). Used when `user_profiles.full_name` is empty or
 * the admin searches by email fragment without a full valid address.
 */
export async function listAuthUsersMatchingNeedle(
  admin: SupabaseClient,
  rawNeedle: string,
  options?: { maxPages?: number; maxResults?: number },
): Promise<Map<string, AuthUserMatch>> {
  const needle = rawNeedle.trim().toLowerCase();
  const out = new Map<string, AuthUserMatch>();
  if (needle.length < 2) return out;

  const maxPages = Math.min(30, Math.max(1, options?.maxPages ?? 12));
  const maxResults = Math.min(50, Math.max(1, options?.maxResults ?? 20));

  for (let page = 1; page <= maxPages && out.size < maxResults; page += 1) {
    const res = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (res.error) break;
    for (const u of res.data.users) {
      if (!u.id) continue;
      const em = (u.email ?? "").toLowerCase();
      const metaName = metaDisplayNameFromUser(u);
      const metaLower = metaName?.toLowerCase() ?? "";
      if (em.includes(needle) || metaLower.includes(needle)) {
        out.set(u.id, {
          id: u.id,
          email: u.email ? normalizeEmail(String(u.email)) : null,
          metaDisplayName: metaName,
        });
      }
    }
    if (res.data.users.length < 1000) break;
  }
  return out;
}
