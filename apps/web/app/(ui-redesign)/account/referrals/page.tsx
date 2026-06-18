"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Copy,
  Gift,
  MessageCircle,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import { useReferralSummary } from "@/hooks/useReferralSummary";
import { HelpCard } from "@/components/account/HelpCard";
import { StatCard } from "@/components/account/StatCard";
import { Button } from "@/components/ui/button";
import { useDashboardToast } from "@/components/dashboard/dashboard-toast-context";

const HOW_IT_WORKS = [
  {
    step: "1",
    icon: Copy,
    title: "Share your code",
    desc: "Copy your unique referral link and share it with friends, family, or on social media.",
  },
  {
    step: "2",
    icon: Users,
    title: "Friend books a clean",
    desc: "When your friend uses your link to book their first Shalean clean, we track the referral.",
  },
  {
    step: "3",
    icon: Gift,
    title: "Both of you earn",
    desc: "Once their booking is completed, you both receive a discount on your next clean.",
  },
];

export default function AccountReferralsPage() {
  const toast = useDashboardToast();
  const { data, loading, error, refetch } = useReferralSummary();
  const [copied, setCopied] = useState(false);

  const inviteUrl =
    data?.referralCode && typeof window !== "undefined"
      ? `${window.location.origin}/?ref=${data.referralCode}`
      : null;

  async function copyLink() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      toast("Referral link copied!", "success");
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast("Could not copy — try long-pressing the link.", "error");
    }
  }

  function shareWhatsApp() {
    if (!inviteUrl) return;
    const msg = encodeURIComponent(
      `Hey! I've been using Shalean Cleaning Services in Cape Town — they're great. Use my link to get a discount on your first clean: ${inviteUrl}`,
    );
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  }

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
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Referrals</h1>
        <p className="mt-1 text-sm text-gray-500">
          Invite friends to Shalean and earn rewards for every new customer you bring.
        </p>
      </div>

      {/* Error */}
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}{" "}
          <button type="button" className="font-semibold underline" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      {/* Referral code hero */}
      <div className="overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-600 to-blue-700 p-6 text-white shadow-lg">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20">
            <Gift className="h-6 w-6 text-white" strokeWidth={1.75} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-200">Your referral code</p>
            <p className="mt-1 text-3xl font-bold tracking-widest">
              {data?.referralCode ? data.referralCode.toUpperCase() : "—"}
            </p>
            <p className="mt-2 text-sm text-blue-100">
              Share this code or your unique link. Friends get a discount, and so do you.
            </p>
          </div>
        </div>

        {inviteUrl ? (
          <div className="mt-5">
            <p className="mb-2 text-xs text-blue-200">Your invite link</p>
            <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2.5 backdrop-blur">
              <p className="flex-1 truncate font-mono text-xs text-white">{inviteUrl}</p>
              <button
                type="button"
                onClick={() => void copyLink()}
                className="shrink-0 rounded-lg bg-white/20 p-1.5 hover:bg-white/30 transition"
                aria-label="Copy link"
              >
                {copied ? <CheckCircle2 className="h-4 w-4 text-green-300" /> : <Copy className="h-4 w-4 text-white" />}
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Button
                type="button"
                className="rounded-xl bg-white text-blue-700 hover:bg-blue-50 font-semibold"
                onClick={() => void copyLink()}
              >
                <Copy className="mr-2 h-4 w-4" />
                {copied ? "Copied!" : "Copy link"}
              </Button>
              <Button
                type="button"
                className="rounded-xl bg-green-500 text-white hover:bg-green-600 font-semibold"
                onClick={shareWhatsApp}
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                Share on WhatsApp
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-blue-200">Your referral code is being generated — check back soon.</p>
        )}
      </div>

      {/* Stats */}
      {data ? (
        <section>
          <h2 className="mb-4 text-base font-semibold text-gray-900">Your referral stats</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              icon={Users}
              iconBg="bg-blue-100"
              iconColor="text-blue-600"
              value={data.referralsCount ?? 0}
              label="Friends invited"
              sublabel="used your link"
            />
            <StatCard
              icon={Sparkles}
              iconBg="bg-green-100"
              iconColor="text-green-600"
              value={`R ${(data.creditBalance ?? 0).toLocaleString("en-ZA")}`}
              label="Credit balance"
              sublabel="available to use"
            />
            <StatCard
              icon={Gift}
              iconBg="bg-violet-100"
              iconColor="text-violet-600"
              value={`R ${(data.totalEarned ?? 0).toLocaleString("en-ZA")}`}
              label="Total earned"
              sublabel="lifetime rewards"
            />
          </div>
        </section>
      ) : null}

      {/* How it works */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-gray-900">How it works</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {HOW_IT_WORKS.map(({ step, icon: Icon, title, desc }) => (
            <div key={step} className="relative rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                  {step}
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
                  <Icon className="h-5 w-5 text-blue-600" strokeWidth={1.75} />
                </div>
              </div>
              <p className="mt-3 font-semibold text-gray-900">{title}</p>
              <p className="mt-1 text-sm text-gray-500">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Rewards history */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-gray-900">Rewards history</h2>
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          {(data?.referralsCount ?? 0) === 0 ? (
            <div className="flex flex-col items-center py-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50">
                <Star className="h-7 w-7 text-amber-400" strokeWidth={1.5} />
              </div>
              <p className="mt-4 font-semibold text-gray-900">No rewards yet</p>
              <p className="mt-1 text-sm text-gray-500">
                Start sharing your link and rewards will appear here once your friends complete their first booking.
              </p>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-3xl font-bold text-blue-600">
                R {(data?.totalEarned ?? 0).toLocaleString("en-ZA")}
              </p>
              <p className="mt-1 text-sm text-gray-500">
                earned through {data?.referralsCount ?? 0} successful referral{(data?.referralsCount ?? 0) !== 1 ? "s" : ""}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Help */}
      <HelpCard />
    </div>
  );
}
