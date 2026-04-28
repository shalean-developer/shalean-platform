"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useUser } from "@/hooks/useUser";

export function useUserBillingProfile(): {
  billingType: "monthly" | "per_booking" | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const { user, loading: userLoading } = useUser();
  const userId = user?.id;
  const [billingType, setBillingType] = useState<"monthly" | "per_booking" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!userId) {
      setBillingType(null);
      setLoading(false);
      return;
    }
    const sb = getSupabaseClient();
    if (!sb) {
      setError("Supabase is not configured.");
      setBillingType(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await sb.from("user_profiles").select("billing_type").eq("id", userId).maybeSingle();
    if (res.error) {
      setError(res.error.message);
      setBillingType(null);
    } else {
      const t = String((res.data as { billing_type?: string } | null)?.billing_type ?? "per_booking").toLowerCase();
      setBillingType(t === "monthly" ? "monthly" : "per_booking");
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (userLoading) return;
    void fetchProfile();
  }, [userLoading, fetchProfile]);

  return {
    billingType,
    loading: userLoading || loading,
    error,
    refetch: fetchProfile,
  };
}
