"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, Gift } from "lucide-react";
import { useReferralSummary } from "@/hooks/useReferralSummary";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDashboardToast } from "@/components/dashboard/dashboard-toast-context";
import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-skeletons";

export default function DashboardReferralsPage() {
  const toast = useDashboardToast();
  const { data, loading, error, refetch } = useReferralSummary();
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    if (!data?.referralCode) return;
    const inviteUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/?ref=${data.referralCode}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      toast("Link copied.", "success");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Could not copy.", "error");
    }
  }

  if (loading) {
    return <DashboardPageSkeleton />;
  }

  if (error || !data?.referralCode) {
    return (
      <div>
        <PageHeader title="Referrals" description="Invite friends and earn credit." />
        <p className="text-sm text-red-600">
          {error ?? "Could not load referral data."}{" "}
          <button type="button" className="font-semibold underline" onClick={() => void refetch()}>
            Retry
          </button>
        </p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Referrals" description="Invite friends and earn credit toward your next clean." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl border-zinc-200/80 bg-gradient-to-br from-blue-600 to-blue-700 p-1 text-white shadow-lg">
          <CardContent className="rounded-[0.9rem] bg-white p-6 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-50">
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
              <Gift className="h-5 w-5" />
              <span className="text-sm font-semibold uppercase tracking-wide">Your code</span>
            </div>
            <p className="mt-3 font-mono text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{data.referralCode}</p>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Share your link — friends get a warm welcome, you earn when they book.</p>
            <Button type="button" size="lg" className="mt-5 w-full rounded-xl" onClick={() => void copyLink()}>
              <Copy className="h-4 w-4" />
              {copied ? "Copied!" : "Copy link"}
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-zinc-200/80 shadow-md dark:border-zinc-800 dark:bg-zinc-900">
          <CardContent className="space-y-4 p-6">
            <div>
              <p className="text-sm font-medium text-zinc-500">Earned credits</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-blue-600 dark:text-blue-400">
                R {data.totalEarned.toLocaleString("en-ZA")}
              </p>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Successful referrals: {data.referralsCount}</p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Credit balance: R {data.creditBalance.toLocaleString("en-ZA")}</p>
            <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              Credits apply at checkout when you book while signed in.
            </p>
            <Button asChild variant="outline" size="lg" className="w-full rounded-xl">
              <Link href="/dashboard/book">Invite friends — book a clean</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
