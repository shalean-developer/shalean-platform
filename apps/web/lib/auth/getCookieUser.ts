import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Resolves the current Supabase user from request cookies (`@supabase/ssr`).
 *
 * Use this in route handlers that are reached via plain browser navigations
 * (e.g. `<a href>` downloads) where an `Authorization: Bearer` header cannot
 * be attached. Returns `null` when unauthenticated or env is missing.
 */
export async function getCookieUser(): Promise<{ id: string; email: string | null } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;

  const cookieStore = await cookies();
  const supabase = createServerClient(url, anon, {
    auth: { persistSession: false },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {},
    },
  });

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}
