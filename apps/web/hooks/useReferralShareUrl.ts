"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getDashboardAccessToken } from "@/lib/dashboard/dashboardFetch";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";

function buildReferPageUrl(origin: string, refCode?: string | null): string {
  const base = `${origin.replace(/\/+$/, "")}/refer`;
  const code = refCode?.trim();
  if (!code) return base;
  return `${base}?ref=${encodeURIComponent(code.toUpperCase())}`;
}

/**
 * Shareable /refer URL for the current environment.
 * Prefers the browser origin (correct port/host), then optional ?ref= from URL or logged-in profile.
 */
export function useReferralShareUrl(): { shareUrl: string; ready: boolean; refCode: string | null } {
  const searchParams = useSearchParams();
  const refFromQuery = searchParams.get("ref")?.trim().toUpperCase() ?? null;

  const [shareUrl, setShareUrl] = useState(() => buildReferPageUrl(getPublicAppUrlBase(), refFromQuery));
  const [ready, setReady] = useState(false);
  const [refCode, setRefCode] = useState<string | null>(refFromQuery);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const origin = window.location.origin;
      let code = refFromQuery;

      if (!code) {
        try {
          const token = await getDashboardAccessToken();
          if (token) {
            const res = await fetch("/api/referrals/me", {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const data = (await res.json()) as { referralCode?: string };
              code = data.referralCode?.trim().toUpperCase() ?? null;
            }
          }
        } catch {
          // Anonymous visitor — generic /refer link is fine.
        }
      }

      if (cancelled) return;
      setRefCode(code);
      setShareUrl(buildReferPageUrl(origin, code));
      setReady(true);
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [refFromQuery]);

  return { shareUrl, ready, refCode };
}
