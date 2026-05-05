import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined;
let loggedMissingServer = false;

function logMissingSupabaseServerOnce(urlPresent: boolean, keyPresent: boolean): void {
  if (loggedMissingServer) return;
  loggedMissingServer = true;
  console.error("[supabase] Server client unavailable: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.", {
    urlPresent,
    anonKeyPresent: keyPresent,
  });
}

/**
 * Server-side Supabase for RSC, route handlers, and cron-style callers.
 * Uses `@supabase/ssr` (aligned with middleware) with no-op cookies: sufficient for
 * anonymous `anon` reads (blog, marketing). Auth-bound flows should use request-scoped cookies.
 */
export function getSupabaseServer(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  if (!url || !key) {
    logMissingSupabaseServerOnce(Boolean(url), Boolean(key));
    cached = null;
    return cached;
  }

  cached = createServerClient(url, key, {
    auth: {
      persistSession: false,
      lockAcquireTimeout: process.env.NODE_ENV === "development" ? 60_000 : 15_000,
    },
    cookies: {
      getAll() {
        return [];
      },
      setAll() {},
    },
  });
  return cached;
}
