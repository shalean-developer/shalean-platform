import { processLock } from "@supabase/auth-js";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined;

/** Short-lived cache so parallel admin fetches share one `getSession` lock acquisition. */
const ACCESS_TOKEN_CACHE_MS = 5_000;
let accessTokenCache: { token: string | null; at: number } | null = null;
let accessTokenInflight: Promise<string | null> | null = null;
let authListenerAttached = false;

function clearAccessTokenCache(): void {
  accessTokenCache = null;
}

function attachAuthListener(sb: SupabaseClient): void {
  if (authListenerAttached) return;
  authListenerAttached = true;
  sb.auth.onAuthStateChange(() => {
    clearAccessTokenCache();
  });
}

/**
 * Coalesced browser access token read. Prefer this over calling `auth.getSession()` directly
 * from many components/effects — parallel calls queue on Supabase's auth lock and can throw
 * `Acquiring process lock … timed out` in dev (especially on admin pages with many fetches).
 */
export async function getSupabaseAccessToken(): Promise<string | null> {
  const sb = getSupabaseBrowser();
  if (!sb) return null;
  attachAuthListener(sb);

  const now = Date.now();
  if (accessTokenCache && now - accessTokenCache.at < ACCESS_TOKEN_CACHE_MS) {
    return accessTokenCache.token;
  }

  if (accessTokenInflight) return accessTokenInflight;

  accessTokenInflight = (async () => {
    try {
      const { data } = await sb.auth.getSession();
      const token = data.session?.access_token ?? null;
      accessTokenCache = { token, at: Date.now() };
      return token;
    } catch {
      clearAccessTokenCache();
      return null;
    } finally {
      accessTokenInflight = null;
    }
  })();

  return accessTokenInflight;
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
  const isDev = process.env.NODE_ENV === "development";
  cached = createBrowserClient(url, key, {
    auth: {
      // Dev: no acquire timeout — processLock queues serialize; timeout surfaced when many
      // components called getSession in parallel (fixed via getSupabaseAccessToken coalescing).
      lockAcquireTimeout: isDev ? -1 : 15_000,
      ...(isDev ? { lock: processLock } : {}),
    },
  });
  return cached;
}
