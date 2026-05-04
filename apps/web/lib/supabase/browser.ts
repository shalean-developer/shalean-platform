import { processLock } from "@supabase/auth-js";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined;

/**
 * Browser Supabase client (anon key). Returns null if env is missing.
 *
 * Uses `@supabase/ssr` so the session is stored in cookies — required for
 * `middleware.ts` (cleaner route protection + refresh) to see auth on navigations.
 *
 * In development, auth uses {@link processLock} instead of the Web Locks API
 * (`navigator.locks` + `steal`). Next.js Fast Refresh / Strict Mode otherwise
 * often surfaces: `AbortError: Lock broken by another request with the 'steal' option`.
 * **`lockAcquireTimeout`** is raised in dev so Turbopack + parallel auth calls do not hit the
 * default 5s cap (`Acquiring process lock … timed out`). Production keeps default `navigatorLock`
 * with a 15s acquire window.
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
  const isDev = process.env.NODE_ENV === "development";
  /**
   * Default auth `lockAcquireTimeout` is 5s. Turbopack / Fast Refresh + parallel
   * `getSession`/`getUser` can queue on `processLock` longer → "Acquiring process lock … timed out".
   * Longer wait in dev; modest bump in prod so slow devices can still recover via steal.
   */
  cached = createBrowserClient(url, key, {
    auth: {
      lockAcquireTimeout: isDev ? 60_000 : 15_000,
      ...(isDev ? { lock: processLock } : {}),
    },
  });
  return cached;
}
