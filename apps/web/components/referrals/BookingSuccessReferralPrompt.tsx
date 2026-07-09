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
    <section className="mt-6 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-5 text-left dark:border-blue-900/40 dark:from-blue-950/40 dark:to-indigo-950/30">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
          <Gift className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Love your clean? Refer a friend</h2>
          <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Share Shalean with friends and earn Cleaning Credit when they complete their first booking.
          </p>
          <Link
            href={href}
            className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            {hasSession ? "Get your referral link" : "Learn about referrals"}
          </Link>
        </div>
      </div>
    </section>
  );
}
