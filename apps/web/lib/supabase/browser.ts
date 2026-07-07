import { processLock } from "@supabase/auth-js";
import { createBrowserClient } from "@supabase/ssr";
import type { Session } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined;

/** Short-lived cache so parallel admin fetches share one `getSession` lock acquisition. */
const SESSION_CACHE_MS = 5_000;
let sessionCache: { session: Session | null; at: number } | null = null;
let sessionInflight: Promise<Session | null> | null = null;
let authListenerAttached = false;

function clearSessionCache(): void {
  sessionCache = null;
}

function attachAuthListener(sb: SupabaseClient): void {
  if (authListenerAttached) return;
  authListenerAttached = true;
  sb.auth.onAuthStateChange(() => {
    clearSessionCache();
  });
}

/**
 * Coalesced browser session read. Prefer this over calling `auth.getSession()` directly
 * from many components/effects — parallel calls queue on Supabase's auth lock and can throw
 * `Acquiring process lock … timed out` in dev (especially on admin pages with many fetches).
 */
export async function getSupabaseSession(): Promise<Session | null> {
  const sb = getSupabaseBrowser();
  if (!sb) return null;
  attachAuthListener(sb);

  const now = Date.now();
  if (sessionCache && now - sessionCache.at < SESSION_CACHE_MS) {
    return sessionCache.session;
  }

  if (sessionInflight) return sessionInflight;

  sessionInflight = (async () => {
    try {
      const { data } = await sb.auth.getSession();
      const session = data.session ?? null;
      sessionCache = { session, at: Date.now() };
      return session;
    } catch {
      clearSessionCache();
      return null;
    } finally {
      sessionInflight = null;
    }
  })();

  return sessionInflight;
}

/**
 * Coalesced browser access token read (uses {@link getSupabaseSession}).
 */
export async function getSupabaseAccessToken(): Promise<string | null> {
  const session = await getSupabaseSession();
  return session?.access_token ?? null;
}

/**
 * Browser Supabase client (anon key). Returns null if env is missing.
 *
 * Uses `@supabase/ssr` so the session is stored in cookies — required for
 * `proxy.ts` (cleaner route protection + refresh) to see auth on navigations.
 *
 * In development, auth uses {@link processLock} instead of the Web Locks API
 * (`navigator.locks` + `steal`). Next.js Fast Refresh / Strict Mode otherwise
 * often surfaces: `AbortError: Lock broken by another request with the 'steal' option`.
 * We use {@link processLock} in all browser runtimes with `lockAcquireTimeout: -1`
 * so parallel session reads queue instead of timing out.
 * Use {@link getSupabaseAccessToken} for bearer tokens instead of parallel `getSession()` calls.
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
  cached = createBrowserClient(url, key, {
    auth: {
      // Serialize auth storage; -1 = wait indefinitely (avoids parallel getSession timeouts).
      lock: processLock,
      lockAcquireTimeout: -1,
    },
  });
  return cached;
}
