"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Gift, Loader2, Sparkles, Clock, Users, Crown } from "lucide-react";
import { getSession } from "@/lib/auth/authClient";
import { PromotionDashboardCard } from "@/components/promotions/PromotionDashboardCard";

type RewardsPayload = {
  activePromotions: {
    id: string;
    name: string;
    description: string | null;
    type: string;
    headline: string;
    cta?: string;
    endsAt: string | null;
    promoCode: string | null;
    discountType: string;
    discountValue: number;
    landingPagePath: string | null;
  }[];
  seasonalOffers: {
    id: string;
    name: string;
    headline: string;
    endsAt: string | null;
    promoCode: string | null;
    landingPagePath: string | null;
  }[];
  referralCredits: {
    balanceZar: number;
    totalEarnedZar: number;
    totalUsedZar: number;
    nextExpiryAt: string | null;
  };
  birthdayReward: { creditZar: number; expiresAt: string; daysLeft: number } | null;
  membership: {
    status: string;
    savingsToDateZar: number;
    discountPercent: number;
    plan: unknown;
    currentPeriodEnd: string | null;
  } | null;
  bundleSuggestions: {
    id: string;
    name: string;
    discountType: string;
    discountValue: number;
  }[];
  expiringRewards: { type: string; label: string; amountZar: number; expiresAt: string }[];
  profile: { dateOfBirth: string | null; tier: string };
};

function formatZar(n: number) {
  return `R${Math.round(n).toLocaleString("en-ZA")}`;
}

export default function AccountRewardsPage() {
  const [data, setData] = useState<RewardsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const session = await getSession();
      if (!session?.access_token) {
        setError("Please sign in to view rewards.");
        setLoading(false);
        return;
      }
      const res = await fetch("/api/account/rewards", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? "Could not load rewards.");
        setLoading(false);
        return;
      }
      setData((await res.json()) as RewardsPayload);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading rewards…
      </div>
    );
  }

  if (error || !data) {
    return <p className="p-8 text-sm text-red-600">{error ?? "Something went wrong."}</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Rewards & Offers</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your promotions, credits, membership savings, and seasonal offers.
        </p>
      </div>

      <PromotionDashboardCard />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
          <p className="text-xs font-medium uppercase text-emerald-700">Cleaning Credit</p>
          <p className="mt-1 text-2xl font-bold text-emerald-900">
            {formatZar(data.referralCredits.balanceZar)}
          </p>
          <Link href="/account/referrals" className="mt-2 inline-block text-xs font-medium text-emerald-800 underline">
            Referrals & history
          </Link>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase text-slate-500">VIP tier</p>
          <p className="mt-1 text-2xl font-bold capitalize text-slate-900">{data.profile.tier}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase text-slate-500">Membership</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {data.membership ? `${data.membership.discountPercent}% off` : "—"}
          </p>
          {data.membership ? (
            <p className="mt-1 text-xs text-slate-500">
              Saved {formatZar(data.membership.savingsToDateZar)} to date · discount applies at checkout
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-500">
              Membership plans are assigned by Shalean — ask support if you&apos;d like one
            </p>
          )}
        </div>
      </div>

      {data.birthdayReward ? (
        <div className="rounded-2xl border border-pink-100 bg-pink-50 p-5">
          <div className="flex items-start gap-3">
            <Gift className="mt-0.5 h-5 w-5 text-pink-600" />
            <div className="flex-1">
              <h2 className="font-semibold text-pink-950">Birthday Cleaning Credit</h2>
              <p className="mt-1 text-sm text-pink-900">
                {formatZar(data.birthdayReward.creditZar)} available — expires in{" "}
                {data.birthdayReward.daysLeft} day{data.birthdayReward.daysLeft === 1 ? "" : "s"}.
              </p>
              <Link
                href="/book"
                className="mt-3 inline-flex rounded-xl bg-pink-700 px-4 py-2 text-sm font-semibold text-white"
              >
                Redeem now
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {data.expiringRewards.length > 0 ? (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Clock className="h-5 w-5" /> Expiring soon
          </h2>
          <ul className="space-y-2">
            {data.expiringRewards.map((r) => (
              <li
                key={`${r.type}-${r.expiresAt}`}
                className="flex justify-between rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm"
              >
                <span>
                  {r.label} · {formatZar(r.amountZar)}
                </span>
                <span className="text-amber-800">
                  Expires {new Date(r.expiresAt).toLocaleDateString("en-ZA")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Sparkles className="h-5 w-5" /> Active promotions
        </h2>
        <div className="space-y-3">
          {data.activePromotions.length === 0 ? (
            <p className="text-sm text-slate-500">No active promotions right now — check back soon.</p>
          ) : (
            data.activePromotions.map((p) => (
              <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="font-semibold text-slate-900">{p.headline}</p>
                {p.description ? <p className="mt-1 text-sm text-slate-600">{p.description}</p> : null}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {p.promoCode ? (
                    <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-mono">{p.promoCode}</span>
                  ) : null}
                  <Link
                    href={p.landingPagePath || "/book"}
                    className="text-sm font-medium text-blue-700 underline"
                  >
                    {p.cta ?? "Book now"}
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {data.seasonalOffers.length > 0 ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Seasonal offers</h2>
          <div className="space-y-3">
            {data.seasonalOffers.map((o) => (
              <div key={o.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="font-semibold">{o.headline}</p>
                {o.endsAt ? (
                  <p className="mt-1 text-xs text-slate-500">
                    Ends {new Date(o.endsAt).toLocaleDateString("en-ZA")}
                  </p>
                ) : null}
                <Link href={o.landingPagePath || "/book"} className="mt-2 inline-block text-sm text-blue-700 underline">
                  View offer
                </Link>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {data.bundleSuggestions.length > 0 ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Bundle & save</h2>
          <ul className="space-y-2">
            {data.bundleSuggestions.map((b) => (
              <li key={b.id} className="rounded-xl border border-slate-200 px-4 py-3 text-sm">
                <span className="font-medium">{b.name}</span>
                <span className="ml-2 text-emerald-700">
                  {b.discountType === "percent"
                    ? `${b.discountValue}% off`
                    : `${formatZar(b.discountValue)} off`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Link
          href="/account/referrals"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium"
        >
          <Users className="h-4 w-4" /> Referral programme
        </Link>
        <Link
          href="/book"
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
        >
          <Crown className="h-4 w-4" /> Book a clean
        </Link>
      </div>
    </div>
  );
}
