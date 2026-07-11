import type { TokenProvider } from "@shalean/api-client";
import { getSupabaseAccessToken, getSupabaseBrowser } from "@/lib/supabase/browser";

/**
 * Web TokenProvider for `@shalean/api-client`.
 *
 * - Reads the Supabase browser session JWT (cookie-backed via `@supabase/ssr`).
 * - Does not touch localStorage.
 * - Optional refresh uses Supabase `refreshSession` (same SDK the web app already uses).
 * - Callers must opt into 401 refresh via `createApiClient({ auth: { retryOnUnauthorized: true } })`.
 *   The default web API client leaves that off so existing 401 handling is unchanged.
 */
export const webTokenProvider: TokenProvider = {
  getAccessToken: async () => getSupabaseAccessToken(),

  refreshAccessToken: async () => {
    const sb = getSupabaseBrowser();
    if (!sb) return null;
    const { data, error } = await sb.auth.refreshSession();
    if (error || !data.session?.access_token) return null;
    return data.session.access_token;
  },
};
