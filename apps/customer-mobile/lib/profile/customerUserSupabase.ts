import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/constants/config";

/**
 * User-scoped Supabase client (Bearer JWT) for RLS-backed reads/writes.
 * Used when customer REST routes are not yet deployed on the API host.
 */
export function createCustomerUserSupabase(accessToken: string): SupabaseClient {
  const url = SUPABASE_URL?.trim();
  const anon = SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) {
    throw new Error("Supabase is not configured.");
  }
  const token = accessToken.trim();
  if (!token) throw new Error("Sign in required.");

  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
