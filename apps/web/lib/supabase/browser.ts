import { processLock } from "@supabase/auth-js";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined;

/**
 * Browser Supabase client (anon key). Returns null if env is missing.
 *
 * In development, auth uses {@link processLock} instead of the Web Locks API
 * (`navigator.locks` + `steal`). Next.js Fast Refresh / Strict Mode otherwise
 * often surfaces: `AbortError: Lock broken by another request with the 'steal' option`.
 * Production keeps the default `navigatorLock` for cross-tab session safety.
 */
export function getSupabaseBrowser(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    cached = null;
    return null;
  }
  cached = createClient(url, key, {
    auth:
      process.env.NODE_ENV === "development"
        ? {
            lock: processLock,
          }
        : {},
  });
  return cached;
}
