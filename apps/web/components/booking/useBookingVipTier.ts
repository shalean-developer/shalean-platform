"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { useAuth } from "@/lib/auth/useAuth";
import type { VipTier } from "@/lib/pricing/vipTier";
import { normalizeVipTier } from "@/lib/pricing/vipTier";

/**
 * Loads `user_profiles.tier` for the signed-in user; guests use `regular` (no loyalty discount until they log in).
 */
export function useBookingVipTier(): { tier: VipTier; loading: boolean } {
  const { user, loading: authLoading } = useAuth();
  const [tier, setTier] = useState<VipTier>("regular");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) {
      setTier("regular");
      setLoading(false);
      return;
    }

    let cancelled = false;
    const sb = getSupabaseBrowser();
    if (!sb) {
      setTier("regular");
      setLoading(false);
      return;
    }

    void (async () => {
      const { data } = await sb.from("user_profiles").select("tier").eq("id", user.id).maybeSingle();
      if (cancelled) return;
      setTier(normalizeVipTier(data && typeof data === "object" && "tier" in data ? String((data as { tier?: string }).tier) : null));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id]);

  return { tier, loading: authLoading || loading };
}
