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

function snapshotFromAuthUser(u: {
  id: string;
  email?: string | null;
  user_metadata?: unknown;
}): AuthUserMatch {
  return {
    id: u.id,
    email: u.email ? normalizeEmail(String(u.email)) : null,
    metaDisplayName: metaDisplayNameFromUser(u),
  };
}

/** Reliable auth lookup for a known set of user ids (used when listing all customers). */
export async function fetchAuthUsersByIds(
  admin: SupabaseClient,
  userIds: readonly string[],
): Promise<Map<string, AuthUserMatch>> {
  const out = new Map<string, AuthUserMatch>();
  const ids = [...new Set(userIds.map((id) => String(id ?? "").trim()).filter(Boolean))];
  const chunkSize = 10;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (id) => {
        const { data } = await admin.auth.admin.getUserById(id);
        if (data?.user?.id) {
          out.set(id, snapshotFromAuthUser(data.user));
        }
      }),
    );
  }
  return out;
}

/**
 * Single paginated `auth.admin.listUsers` scan that captures both:
 *   - users whose email / metadata display name contains `needle`
 *     (case-insensitive, capped at `maxNeedleResults`), AND
 *   - users whose id is in `captureIds` (no cap — every requested id is
 *     captured if encountered before the scan terminates).
 *
 * H-13: Used by admin customer search to enrich `user_profiles` ilike
 * matches with their auth email + metadata display name in a single
 * pagination pass, instead of one `auth.admin.getUserById` call per row.
 */
export async function scanAuthUsersForAdminCustomerSearch(
  admin: SupabaseClient,
  options: {
    needle?: string;
    captureIds?: ReadonlySet<string>;
    maxPages?: number;
    maxNeedleResults?: number;
  } = {},
): Promise<{
  needleMatches: Map<string, AuthUserMatch>;
  capturedById: Map<string, AuthUserMatch>;
}> {
  const needle = (options.needle ?? "").trim().toLowerCase();
  const captureIds = options.captureIds ?? new Set<string>();
  const maxPages = Math.min(30, Math.max(1, options.maxPages ?? 12));
  const maxNeedleResults = Math.min(50, Math.max(1, options.maxNeedleResults ?? 20));

  const needleMatches = new Map<string, AuthUserMatch>();
  const capturedById = new Map<string, AuthUserMatch>();

  const stillNeedNeedle = () => needle.length >= 2 && needleMatches.size < maxNeedleResults;
  const stillNeedCapture = () => captureIds.size > 0 && capturedById.size < captureIds.size;

  if (!stillNeedNeedle() && !stillNeedCapture()) return { needleMatches, capturedById };

  for (let page = 1; page <= maxPages; page += 1) {
    const res = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (res.error) break;
    for (const u of res.data.users) {
      if (!u.id) continue;
      const snap = snapshotFromAuthUser(u);
      if (captureIds.has(u.id) && !capturedById.has(u.id)) {
        capturedById.set(u.id, snap);
      }
      if (stillNeedNeedle()) {
        const em = (u.email ?? "").toLowerCase();
        const metaLower = snap.metaDisplayName?.toLowerCase() ?? "";
        if (em.includes(needle) || metaLower.includes(needle)) {
          needleMatches.set(u.id, snap);
        }
      }
    }
    if (res.data.users.length < 1000) break;
    if (!stillNeedNeedle() && !stillNeedCapture()) break;
  }
  return { needleMatches, capturedById };
}

/**
 * Paginates `auth.admin.listUsers` and returns users whose email or metadata display name
 * contains `needle` (case-insensitive). Used when `user_profiles.full_name` is empty or
 * the admin searches by email fragment without a full valid address.
 *
 * Thin wrapper around {@link scanAuthUsersForAdminCustomerSearch} for the
 * needle-only call sites that don't have a profile-id set to enrich.
 */
export async function listAuthUsersMatchingNeedle(
  admin: SupabaseClient,
  rawNeedle: string,
  options?: { maxPages?: number; maxResults?: number },
): Promise<Map<string, AuthUserMatch>> {
  const { needleMatches } = await scanAuthUsersForAdminCustomerSearch(admin, {
    needle: rawNeedle,
    maxPages: options?.maxPages,
    maxNeedleResults: options?.maxResults,
  });
  return needleMatches;
}
