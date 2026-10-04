"use client";

import { useEffect, useState } from "react";
import { getDashboardAccessToken } from "@/lib/dashboard/dashboardFetch";

export type ReferralLandingAudience = "loading" | "referrer" | "friend";

/**
 * `/refer` serves two audiences:
 * - **referrer** — existing customers sharing the program (default, or own referral code)
 * - **friend** — someone who opened another person's referral link
 *
 * The referral code is resolved by the server route and passed in explicitly so
 * hydration timing cannot drop the query parameter for anonymous visitors.
 */
export function useReferralLandingAudience(referralCode: string | null): ReferralLandingAudience {
  const refFromQuery = referralCode?.trim().toUpperCase() || null;
  const [audience, setAudience] = useState<ReferralLandingAudience>(refFromQuery ? "loading" : "referrer");

  useEffect(() => {
    if (!refFromQuery) {
      setAudience("referrer");
      return;
    }

    setAudience("loading");
    let cancelled = false;

    async function resolve() {
      try {
        const token = await getDashboardAccessToken();
        if (token) {
          const res = await fetch("/api/referrals/me", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = (await res.json()) as { referralCode?: string };
            const ownCode = data.referralCode?.trim().toUpperCase() ?? null;
            if (ownCode && ownCode === refFromQuery) {
              if (!cancelled) setAudience("referrer");
              return;
            }
          }
        }
      } catch {
        // Anonymous visitor or session unavailable — treat as referred friend.
      }
      if (!cancelled) setAudience("friend");
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [refFromQuery]);

  return audience;
}
