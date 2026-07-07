import { getSupabaseAccessToken } from "@/lib/supabase/browser";

/** Auth headers for `/api/cleaner/*` — Supabase session JWT only. */
export async function getCleanerAuthHeaders(): Promise<Record<string, string> | null> {
  const token = (await getSupabaseAccessToken())?.trim();
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}
