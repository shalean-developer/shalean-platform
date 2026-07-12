import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/constants/config";

let cached: SupabaseClient | null = null;

/**
 * Anon Supabase client for Auth only — sessions are persisted in SecureStore,
 * not in supabase-js storage (matches Cleaner token ownership model).
 */
export function getSupabaseAuthClient(): SupabaseClient {
  const url = SUPABASE_URL?.trim();
  const anon = SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) {
    throw new Error("Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.");
  }
  if (!cached) {
    cached = createClient(url, anon, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return cached;
}

export function resetSupabaseAuthClient(): void {
  cached = null;
}
