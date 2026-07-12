import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/constants/config";
import {
  clearSessionTokens,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from "@/lib/storage/tokenStorage";

type RefreshResponse = {
  access_token?: string;
  refresh_token?: string;
  error?: string;
  error_description?: string;
};

/**
 * Refresh the Supabase access JWT using the stored refresh token.
 * Same grant as supabase-js / Cleaner app refresh.
 */
export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = (await getRefreshToken())?.trim();
  if (!refreshToken) return null;

  const url = SUPABASE_URL?.trim();
  const anon = SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) {
    console.warn(
      "[customer-mobile] Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY; cannot refresh session.",
    );
    return null;
  }

  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anon,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    const json = (await res.json().catch(() => ({}))) as RefreshResponse;
    if (!res.ok || !json.access_token) {
      await clearSessionTokens();
      return null;
    }

    await setAccessToken(json.access_token);
    if (json.refresh_token) {
      await setRefreshToken(json.refresh_token);
    }
    return json.access_token;
  } catch {
    return null;
  }
}
