import { getSupabaseBrowser } from "@/lib/supabase/browser";

/** Auth headers for `/api/cleaner/*` — Supabase session JWT only. */
export async function getCleanerAuthHeaders(): Promise<Record<string, string> | null> {
  const sb = getSupabaseBrowser();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token?.trim();
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}
