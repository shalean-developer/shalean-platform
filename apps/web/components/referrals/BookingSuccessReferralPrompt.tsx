"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Gift } from "lucide-react";
import { getDashboardAccessToken } from "@/lib/dashboard/dashboardFetch";

export function BookingSuccessReferralPrompt({ hasSession }: { hasSession: boolean }) {
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(hasSession);

  useEffect(() => {
    if (!hasSession) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const token = await getDashboardAccessToken();
      if (!token || cancelled) {
        if (!cancelled) setLoading(false);
        return;
      }
      const res = await fetch("/api/referrals/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (!cancelled) setLoading(false);
        return;
      }
      const json = (await res.json()) as { referralCode?: string };
      if (!cancelled) {
        setReferralCode(json.referralCode?.trim() || null);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasSession]);

  if (loading) return null;

  const href = hasSession && referralCode ? "/account/referrals" : "/refer";

  return (
    <section className="mt-4 rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-3.5 text-left dark:border-blue-900/40 dark:from-blue-950/40 dark:to-indigo-950/30">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
            <Gift className="h-4.5 w-4.5" strokeWidth={1.75} aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Refer a friend</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              Earn Cleaning Credit after their first booking.
            </p>
          </div>
        </div>
        <Link
          href={href}
          className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
        >
          {hasSession ? "Get referral link" : "Learn more"}
        </Link>
      </div>
    </section>
  );
}
