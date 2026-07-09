"use client";

import { useEffect, useState } from "react";
import { getDashboardAccessToken } from "@/lib/dashboard/dashboardFetch";
import { getStoredReferral } from "@/lib/referrals/client";
import type { ReferralCheckoutInvalidReason } from "@/lib/referrals/referralCheckoutReasons";

export type StoredReferralCheckoutDiscount = {
  code: string;
  discountZar: number;
};

export type UseStoredReferralCheckoutDiscountOptions = {
  email?: string | null;
  bookingTotalZar?: number;
  serviceSlug?: string;
};

/**
 * Reads a referral code captured from `?ref=` and validates it for checkout.
 * No manual code entry — discount is applied automatically when valid.
 */
export function useStoredReferralCheckoutDiscount(
  emailOrOpts?: string | null | UseStoredReferralCheckoutDiscountOptions,
  legacyEmail?: string | null,
): {
  referralDiscount: StoredReferralCheckoutDiscount | null;
  loading: boolean;
  invalidReason: ReferralCheckoutInvalidReason | null;
  invalidMessage: string | null;
} {
  const opts: UseStoredReferralCheckoutDiscountOptions =
    emailOrOpts != null && typeof emailOrOpts === "object"
      ? emailOrOpts
      : { email: emailOrOpts ?? legacyEmail ?? null };

  const [referralDiscount, setReferralDiscount] = useState<StoredReferralCheckoutDiscount | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalidReason, setInvalidReason] = useState<ReferralCheckoutInvalidReason | null>(null);
  const [invalidMessage, setInvalidMessage] = useState<string | null>(null);

  useEffect(() => {
    const code = getStoredReferral("customer");
    if (!code) {
      setReferralDiscount(null);
      setInvalidReason(null);
      setInvalidMessage(null);
      setLoading(false);
      return;
    }

    const storedCode = code;

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
            code: storedCode,
            email: opts.email?.trim() || undefined,
            bookingTotalZar: opts.bookingTotalZar,
            serviceSlug: opts.serviceSlug,
          }),
        });
        const json = (await res.json()) as {
          valid?: boolean;
          code?: string;
          discountZar?: number;
          reason?: ReferralCheckoutInvalidReason;
          message?: string;
        };
        if (cancelled) return;
        if (json.valid && Number(json.discountZar) > 0) {
          setReferralDiscount({
            code: json.code?.trim().toUpperCase() ?? storedCode,
            discountZar: Math.round(Number(json.discountZar)),
          });
          setInvalidReason(null);
          setInvalidMessage(null);
        } else {
          setReferralDiscount(null);
          setInvalidReason(json.reason ?? null);
          setInvalidMessage(json.message?.trim() || null);
        }
      } catch {
        if (!cancelled) {
          setReferralDiscount(null);
          setInvalidReason(null);
          setInvalidMessage(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void validate();
    return () => {
      cancelled = true;
    };
  }, [opts.email, opts.bookingTotalZar, opts.serviceSlug]);

  return { referralDiscount, loading, invalidReason, invalidMessage };
}
