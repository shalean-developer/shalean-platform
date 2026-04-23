import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined;
let loggedMissingAdmin = false;

function logMissingSupabaseAdminOnce(urlPresent: boolean, keyPresent: boolean): void {
  if (loggedMissingAdmin) return;
  loggedMissingAdmin = true;
  console.error(
    "[supabase] Admin client unavailable: set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY).",
    { urlPresent, serviceRoleKeyPresent: keyPresent },
  );
  if (process.env.NODE_ENV !== "production") {
    console.error(
      "[supabase] Next.js loads .env.local from the Next app root (this repo: apps/web/.env.local). Restart the dev server after changes.",
    );
  }
}

/** Safe JSON for API routes when {@link getSupabaseAdmin} is null. */
export function supabaseAdminNotConfiguredBody() {
  return {
    error: "Scheduling is temporarily unavailable. Please try again shortly.",
    errorCode: "SUPABASE_ADMIN_NOT_CONFIGURED" as const,
  };
}

/** Server-only Supabase client with service role. Returns null if env is not configured. */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url =
    (process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim()) ?? "";
  const key =
    (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SERVICE_KEY?.trim()) ?? "";
  if (!url || !key) {
    logMissingSupabaseAdminOnce(Boolean(url), Boolean(key));
    cached = null;
    return null;
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}
