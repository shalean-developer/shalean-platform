"use client";

import { useCallback, useEffect, useState } from "react";
import { getDashboardAccessToken } from "@/lib/dashboard/dashboardFetch";
import { useUser } from "@/hooks/useUser";

export type ReferralSummary = {
  referralCode: string;
  totalEarned: number;
  referralsCount: number;
  creditBalance: number;
  creditUsed?: number;
  nextExpiryAt?: string | null;
  totalReferrals?: number;
  pendingReferrals?: number;
  successfulReferrals?: number;
  referralHistory?: {
    id: string;
    status: string;
    rewardAmount: number;
    referredContact: string | null;
    createdAt: string;
    rewardedAt: string | null;
  }[];
};

export function useReferralSummary(): {
  data: ReferralSummary | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const { user, loading: userLoading } = useUser();
  const [data, setData] = useState<ReferralSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) {
      setData(null);
      setLoading(false);
      return;
    }
    const token = await getDashboardAccessToken();
    if (!token) {
      setError("Not signed in.");
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch("/api/referrals/me", { headers: { Authorization: `Bearer ${token}` } });
    const j = (await res.json()) as ReferralSummary & { error?: string };
    if (!res.ok) {
      setError(j.error ?? "Could not load referral data.");
      setData(null);
    } else {
      setData({
        referralCode: j.referralCode,
        totalEarned: Number(j.totalEarned ?? 0),
        referralsCount: Number(j.referralsCount ?? 0),
        creditBalance: Number(j.creditBalance ?? 0),
        creditUsed: Number(j.creditUsed ?? 0),
        nextExpiryAt: j.nextExpiryAt ?? null,
        totalReferrals: Number(j.totalReferrals ?? 0),
        pendingReferrals: Number(j.pendingReferrals ?? 0),
        successfulReferrals: Number(j.successfulReferrals ?? 0),
        referralHistory: j.referralHistory ?? [],
      });
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (userLoading) return;
    void load();
  }, [userLoading, load]);

  return { data, loading: userLoading || loading, error, refetch: load };
}
