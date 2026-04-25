import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

/** Server-side public Supabase client for cached marketing reads. */
export function getSupabaseServer(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  if (!url || !key) {
    logMissingSupabaseServerOnce(Boolean(url), Boolean(key));
    cached = null;
    return cached;
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}
