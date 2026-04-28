import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  recordLegacyCleanerAuthMetric,
  shouldEmitLegacyRowMatchLog,
} from "@/lib/cleaner/cleanerAuthLegacyMetrics";
import { logSystemEvent } from "@/lib/logging/systemLog";

export function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization") ?? "";
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  const t = m?.[1]?.trim();
  return t || null;
}

/** Legacy `x-cleaner-id` auth is permanently disabled in production builds. */
export function cleanerAuthAllowLegacyHeader(): boolean {
  return false;
}

export type ResolvedCleanerRow = { id: string };

export type CleanerAuthUser = { id: string; email: string | null };

export type ResolveCleanerFromRequestResult =
  | { ok: true; cleaner: ResolvedCleanerRow; authUserId: string; authUser: CleanerAuthUser | null }
  | { ok: false; error: string; status: number };

async function cleanerRowForAuthUserId(
  admin: SupabaseClient,
  authUserId: string,
): Promise<ResolvedCleanerRow | null> {
  const { data: byAuth } = await admin.from("cleaners").select("id").eq("auth_user_id", authUserId).maybeSingle();
  if (byAuth && typeof (byAuth as { id?: string }).id === "string") {
    return { id: String((byAuth as { id: string }).id) };
  }
  const { data: legacy } = await admin.from("cleaners").select("id").eq("id", authUserId).maybeSingle();
  if (legacy && typeof (legacy as { id?: string }).id === "string") {
    const cleanerId = String((legacy as { id: string }).id);
    recordLegacyCleanerAuthMetric("legacy_id_row_match", { auth_user_id: authUserId, cleaner_id: cleanerId });
    if (shouldEmitLegacyRowMatchLog(authUserId)) {
      void logSystemEvent({
        level: "warn",
        source: "cleaner_auth",
        message: "cleaner_legacy_id_match_used",
        context: { auth_user_id: authUserId, cleaner_id: cleanerId },
      });
    }
    return { id: cleanerId };
  }
  return null;
}

/**
 * Resolve cleaner for `/api/cleaner/*`.
 *
 * **Only** `Authorization: Bearer <jwt>` → Supabase `getUser` → `cleaners.auth_user_id`
 * (fallback: same-row `cleaners.id = auth uid`, logs `cleaner_legacy_id_match_used`).
 *
 * `x-cleaner-id` without Bearer is **not** accepted (spoof-resistant).
 */
export async function resolveCleanerFromRequest(
  request: Request,
  admin: SupabaseClient,
): Promise<ResolveCleanerFromRequestResult> {
  const token = extractBearerToken(request);
  if (token) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) {
      return { ok: false, error: "Server configuration error.", status: 503 };
    }
    const pub = createClient(url, anon);
    const { data: userData, error: userErr } = await pub.auth.getUser(token);
    if (userErr || !userData.user?.id) {
      return { ok: false, error: "Invalid or expired session.", status: 401 };
    }
    const authUserId = userData.user.id;
    const cleaner = await cleanerRowForAuthUserId(admin, authUserId);
    if (!cleaner) {
      return { ok: false, error: "Not a cleaner account.", status: 403 };
    }
    const authUser: CleanerAuthUser = {
      id: authUserId,
      email: userData.user.email ?? null,
    };
    return { ok: true, cleaner, authUserId, authUser };
  }

  return { ok: false, error: "Missing cleaner session.", status: 401 };
}
