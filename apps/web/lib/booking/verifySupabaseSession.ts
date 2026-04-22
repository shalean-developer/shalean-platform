import { createClient } from "@supabase/supabase-js";

/**
 * Verifies JWT and returns user id if valid. Used server-side for checkout.
 */
export async function verifySupabaseAccessToken(accessToken: string): Promise<{ id: string; email?: string } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !accessToken.trim()) return null;

  const supabase = createClient(url, key);
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? undefined };
}
