import { normalizeVipTier, type VipTier } from "@/lib/pricing/vipTier";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Resolve loyalty tier for pricing — server-only (service role). */
export async function resolveVipTierForUserId(userId: string | null | undefined): Promise<VipTier> {
  if (!userId) return "regular";
  const admin = getSupabaseAdmin();
  if (!admin) return "regular";

  const { data, error } = await admin.from("user_profiles").select("tier").eq("id", userId).maybeSingle();
  if (error || !data || typeof data !== "object") return "regular";
  return normalizeVipTier("tier" in data ? String((data as { tier?: string }).tier) : null);
}
