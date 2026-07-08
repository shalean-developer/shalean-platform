"use client";

import { useEffect, useState } from "react";
import { getDashboardAccessToken } from "@/lib/dashboard/dashboardFetch";
import { getStoredReferral } from "@/lib/referrals/client";

export type StoredReferralCheckoutDiscount = {
  code: string;
  discountZar: number;
};

/**
 * Reads a referral code captured from `?ref=` and validates it for checkout.
 * No manual code entry — discount is applied automatically when valid.
 */
export function useStoredReferralCheckoutDiscount(email?: string | null): {
  referralDiscount: StoredReferralCheckoutDiscount | null;
  loading: boolean;
} {
  const [referralDiscount, setReferralDiscount] = useState<StoredReferralCheckoutDiscount | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const code = getStoredReferral("customer");
    if (!code) {
      setReferralDiscount(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function validate() {
      try {
        const token = await getDashboardAccessToken();
        const res = await fetch("/api/referrals/validate-checkout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            code,
            email: email?.trim() || undefined,
          }),
        });
        const json = (await res.json()) as {
          valid?: boolean;
          code?: string;
          discountZar?: number;
        };
        if (!cancelled && json.valid && Number(json.discountZar) > 0) {
          setReferralDiscount({
            code: json.code?.trim().toUpperCase() ?? code,
            discountZar: Math.round(Number(json.discountZar)),
          });
        } else if (!cancelled) {
          setReferralDiscount(null);
        }
      } catch {
        if (!cancelled) setReferralDiscount(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void validate();
    return () => {
      cancelled = true;
    };
  }, [email]);

  return { referralDiscount, loading };
}
