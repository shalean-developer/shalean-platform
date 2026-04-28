import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCleanerFromRequest } from "@/lib/cleaner/resolveCleanerFromRequest";

export {
  cleanerAuthAllowLegacyHeader,
  extractBearerToken,
  resolveCleanerFromRequest,
} from "@/lib/cleaner/resolveCleanerFromRequest";

/** @deprecated Prefer {@link resolveCleanerFromRequest} — kept for tests and gradual import migration. */
export async function resolveCleanerIdFromRequest(
  request: Request,
  admin: SupabaseClient,
): Promise<{ cleanerId: string | null; error?: string; status?: number }> {
  const r = await resolveCleanerFromRequest(request, admin);
  if (!r.ok) {
    return { cleanerId: null, error: r.error, status: r.status };
  }
  return { cleanerId: r.cleaner.id };
}
