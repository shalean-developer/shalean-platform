import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadWorkerConfig } from "./config.ts";

let _client: SupabaseClient | null = null;

/** Singleton service-role Supabase client. */
export function getSupabaseAdmin(): SupabaseClient {
  if (!_client) {
    const cfg = loadWorkerConfig();
    _client = createClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _client;
}

/** Reset client (tests). */
export function resetSupabaseAdminForTests(): void {
  _client = null;
}
