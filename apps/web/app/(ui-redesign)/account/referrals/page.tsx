"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Clock,
  ExternalLink,
  Gift,
  Sparkles,
  Users,
} from "lucide-react";
import { useReferralSummary } from "@/hooks/useReferralSummary";
import { HelpCard } from "@/components/account/HelpCard";
import { StatCard } from "@/components/account/StatCard";
import { Button } from "@/components/ui/button";
import { ReferralCreditHistory } from "@/components/referrals/ReferralCreditHistory";
import { ReferralProgressTracker } from "@/components/referrals/ReferralProgressTracker";
import { ReferralSharePanel } from "@/components/referrals/ReferralSharePanel";
import { cn } from "@/lib/utils";

function buildInviteUrl(referralCode: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/refer?ref=${encodeURIComponent(referralCode.toUpperCase())}`;
}

const HOW_IT_WORKS = [
  { step: "1", icon: Gift, title: "Share your link", desc: "Send your referral link, QR code, or use Share on your phone." },
  { step: "2", icon: Users, title: "Friend books a clean", desc: "When your friend completes their first paid Shalean booking, we track the referral." },
  { step: "3", icon: Sparkles, title: "Earn Cleaning Credit", desc: "Cleaning Credit is added to your account. Use it on your next booking." },
];

function statusLabel(status: string): { label: string; cls: string } {
  const s = status.toLowerCase();
  if (s === "rewarded" || s === "completed") return { label: "Reward issued", cls: "bg-emerald-100 text-emerald-700" };
  if (s === "pending") return { label: "Pending", cls: "bg-orange-100 text-orange-700" };
  if (s === "cancelled") return { label: "Cancelled", cls: "bg-red-100 text-red-700" };
  if (s === "expired") return { label: "Expired", cls: "bg-gray-100 text-gray-600" };
  return { label: status, cls: "bg-gray-100 text-gray-600" };
}

export default function AccountReferralsPage() {
  const { data, loading, error, refetch } = useReferralSummary();
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  useEffect(() => {
    if (data?.referralCode) {
      setInviteUrl(buildInviteUrl(data.referralCode));
    } else {
      setInviteUrl(null);
    }
  }, [data?.referralCode]);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 rounded-xl bg-gray-100" />
        <div className="h-48 rounded-2xl bg-gray-100" />
        <div className="grid grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-24 rounded-2xl bg-gray-100" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Referrals & Cleaning Credit</h1>
          <p className="mt-1 text-sm text-gray-500">
            Earn Cleaning Credit when friends complete their first booking. Rewards are credit only, not cash.
          </p>
        </div>
        <Button asChild variant="outline" className="rounded-xl">
          <Link href="/refer">
            Referral page <ExternalLink className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}{" "}
          <button type="button" className="font-semibold underline" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-600 to-indigo-700 p-6 text-white shadow-lg">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20">
            <Gift className="h-6 w-6 text-white" strokeWidth={1.75} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-200">Your referral code</p>
            <p className="mt-1 text-3xl font-bold tracking-widest">
              {data?.referralCode ? data.referralCode.toUpperCase() : "..."}
            </p>
            <p className="mt-2 text-sm text-blue-100">
              Share your link, scan the QR code, or tap Share on your phone.
            </p>
          </div>
        </div>

        {inviteUrl && data?.referralCode ? (
          <ReferralSharePanel referralCode={data.referralCode} inviteUrl={inviteUrl} />
        ) : null}
      </div>

      {data?.nextExpiryAt ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            Some Cleaning Credit expires on{" "}
            <strong>{new Date(data.nextExpiryAt).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}</strong>.
            Use it at checkout before then.
          </p>
        </div>
      ) : null}

      {data ? (
        <section>
          <h2 className="mb-4 text-base font-semibold text-gray-900">Your referral stats</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard icon={Users} iconBg="bg-blue-100" iconColor="text-blue-600" value={data.totalReferrals ?? 0} label="Total referrals" sublabel="submitted" />
            <StatCard icon={Sparkles} iconBg="bg-emerald-100" iconColor="text-emerald-600" value={data.successfulReferrals ?? 0} label="Successful" sublabel="rewarded" />
            <StatCard icon={Users} iconBg="bg-orange-100" iconColor="text-orange-600" value={data.pendingReferrals ?? 0} label="Pending" sublabel="in progress" />
            <StatCard icon={Gift} iconBg="bg-green-100" iconColor="text-green-600" value={`R ${(data.creditBalance ?? 0).toLocaleString("en-ZA")}`} label="Available credit" sublabel="use at checkout" />
            <StatCard icon={Sparkles} iconBg="bg-violet-100" iconColor="text-violet-600" value={`R ${(data.totalEarned ?? 0).toLocaleString("en-ZA")}`} label="Total earned" sublabel={`R ${(data.creditUsed ?? 0).toLocaleString("en-ZA")} used`} />
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="mb-4 text-base font-semibold text-gray-900">How it works</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {HOW_IT_WORKS.map(({ step, icon: Icon, title, desc }) => (
            <div key={step} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition hover:shadow-md">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">{step}</div>
              <Icon className="mt-3 h-5 w-5 text-blue-600" strokeWidth={1.75} />
              <p className="mt-2 font-semibold text-gray-900">{title}</p>
              <p className="mt-1 text-sm text-gray-500">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-base font-semibold text-gray-900">Referral history</h2>
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
          {(data?.referralHistory?.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <Gift className="h-10 w-10 text-gray-300" />
              <p className="mt-3 font-semibold text-gray-900">No referrals yet</p>
              <p className="mt-1 text-sm text-gray-500">Share your link to get started.</p>
              <Button asChild className="mt-4 rounded-xl"><Link href="/refer">Refer a friend <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {data?.referralHistory?.map((r) => {
                const st = statusLabel(r.status);
                return (
                  <li key={r.id} className="space-y-3 px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-gray-900">{r.referredContact ?? "Friend"}</p>
                        <p className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleDateString("en-ZA")}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {r.rewardAmount > 0 ? <span className="text-sm font-semibold text-gray-700">R {r.rewardAmount}</span> : null}
                        <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", st.cls)}>{st.label}</span>
                      </div>
                    </div>
                    <ReferralProgressTracker status={r.status} />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-base font-semibold text-gray-900">Credit history</h2>
        <ReferralCreditHistory />
      </section>

      <HelpCard />
    </div>
  );
}
