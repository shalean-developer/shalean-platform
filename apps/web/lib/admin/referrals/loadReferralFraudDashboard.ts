import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { buildReferrerDisplayLabel } from "@/lib/admin/referralsReadModelFormat";
import { loadDuplicateFingerprintAlerts } from "@/lib/referrals/duplicateDetection";
import { computeReferralFraudScore } from "@/lib/referrals/fraudScore";

export type ReferralFraudReferrerRow = {
  referrerType: "customer" | "cleaner";
  referrerId: string;
  displayLabel: string;
  fraudScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  signals: { code: string; label: string }[];
  currentMonthRedemptions: number;
  estimatedNetContributionZar: number | null;
};

export type ReferralFraudDashboardPayload = {
  summary: {
    highOrCriticalCount: number;
    spikeFlagCount: number;
    duplicateFingerprintCount: number;
    reconciliationQueueCount: number;
  };
  referrers: ReferralFraudReferrerRow[];
  duplicateFingerprints: Awaited<ReturnType<typeof loadDuplicateFingerprintAlerts>>;
};

async function hydrateLabels(
  admin: SupabaseClient,
  refs: { referrer_type: string; referrer_id: string }[],
): Promise<Map<string, string>> {
  const customerIds = refs.filter((r) => r.referrer_type === "customer").map((r) => r.referrer_id);
  const cleanerIds = refs.filter((r) => r.referrer_type === "cleaner").map((r) => r.referrer_id);
  const labels = new Map<string, string>();

  if (customerIds.length) {
    const { data } = await admin
      .from("user_profiles")
      .select("id, full_name, referral_code")
      .in("id", customerIds);
    for (const p of data ?? []) {
      const row = p as { id: string; full_name?: string | null; referral_code?: string | null };
      labels.set(
        `customer:${row.id}`,
        buildReferrerDisplayLabel({
          displayName: row.full_name ?? null,
          referralCode: row.referral_code ?? null,
          emailOrPhone: null,
          fallbackId: row.id,
        }),
      );
    }
  }

  if (cleanerIds.length) {
    const { data } = await admin
      .from("cleaners")
      .select("id, full_name, referral_code, email, phone, phone_number")
      .in("id", cleanerIds);
    for (const c of data ?? []) {
      const row = c as {
        id: string;
        full_name?: string | null;
        referral_code?: string | null;
        email?: string | null;
        phone?: string | null;
        phone_number?: string | null;
      };
      labels.set(
        `cleaner:${row.id}`,
        buildReferrerDisplayLabel({
          displayName: row.full_name ?? null,
          referralCode: row.referral_code ?? null,
          emailOrPhone: row.phone_number ?? row.phone ?? row.email ?? null,
          fallbackId: row.id,
        }),
      );
    }
  }

  return labels;
}

export async function loadReferralFraudDashboard(
  admin: SupabaseClient,
): Promise<ReferralFraudDashboardPayload> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const maxMonthly = Number(process.env.REFERRAL_MAX_REWARDED_PER_REFERRER_MONTH ?? "25");

  const [spikes, quality, duplicateFingerprints, reconCount, monthlyRewards] = await Promise.all([
    admin
      .from("admin_referrer_redemption_spike_flags")
      .select("*")
      .eq("spike_suspected", true)
      .limit(100),
    admin.from("admin_referrer_quality_signals").select("*").limit(200),
    loadDuplicateFingerprintAlerts(admin, 30),
    admin
      .from("admin_referral_reconciliation_queue")
      .select("booking_id", { count: "exact", head: true }),
    admin
      .from("referrals")
      .select("referrer_id")
      .eq("referrer_type", "customer")
      .eq("status", "rewarded")
      .gte("rewarded_at", since),
  ]);

  const capHitReferrerIds = new Set<string>();
  if (monthlyRewards.data?.length) {
    const counts = new Map<string, number>();
    for (const row of monthlyRewards.data) {
      const id = String((row as { referrer_id?: string }).referrer_id ?? "");
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    for (const [id, count] of counts) {
      if (count >= maxMonthly) capHitReferrerIds.add(id);
    }
  }

  const spikeByKey = new Map<
    string,
    { currentMonthRedemptions: number; avgPrior3MonthsRedemptions: number; spikeSuspected: boolean }
  >();
  for (const row of spikes.data ?? []) {
    const r = row as {
      referrer_type?: string;
      referrer_id?: string;
      current_month_redemptions?: number;
      avg_prior_3_months_redemptions?: number;
      spike_suspected?: boolean;
    };
    const key = `${r.referrer_type}:${r.referrer_id}`;
    spikeByKey.set(key, {
      currentMonthRedemptions: Number(r.current_month_redemptions ?? 0),
      avgPrior3MonthsRedemptions: Number(r.avg_prior_3_months_redemptions ?? 0),
      spikeSuspected: Boolean(r.spike_suspected),
    });
  }

  const dupIdentitiesByReferrerCode = new Map<string, number>();
  for (const d of duplicateFingerprints) {
    dupIdentitiesByReferrerCode.set(
      d.referralCode,
      Math.max(dupIdentitiesByReferrerCode.get(d.referralCode) ?? 0, d.distinctIdentities),
    );
  }

  const { data: codeOwners } = await admin
    .from("user_profiles")
    .select("id, referral_code")
    .not("referral_code", "is", null);
  const dupByReferrerId = new Map<string, number>();
  for (const p of codeOwners ?? []) {
    const row = p as { id?: string; referral_code?: string | null };
    const code = String(row.referral_code ?? "").trim().toUpperCase();
    const identities = dupIdentitiesByReferrerCode.get(code);
    if (row.id && identities) dupByReferrerId.set(row.id, identities);
  }

  const referrerKeys = new Set<string>();
  for (const row of quality.data ?? []) {
    const r = row as { referrer_type?: string; referrer_id?: string };
    if (r.referrer_type && r.referrer_id) referrerKeys.add(`${r.referrer_type}:${r.referrer_id}`);
  }
  for (const key of spikeByKey.keys()) referrerKeys.add(key);

  const refs = [...referrerKeys].map((k) => {
    const [referrer_type, referrer_id] = k.split(":");
    return { referrer_type, referrer_id };
  });
  const labels = await hydrateLabels(admin, refs);

  const referrers: ReferralFraudReferrerRow[] = [];

  for (const key of referrerKeys) {
    const [referrerTypeRaw, referrerId] = key.split(":");
    const referrerType = referrerTypeRaw === "cleaner" ? "cleaner" : "customer";
    const q = (quality.data ?? []).find(
      (row) =>
        String((row as { referrer_id?: string }).referrer_id) === referrerId &&
        String((row as { referrer_type?: string }).referrer_type) === referrerTypeRaw,
    ) as
      | {
          reward_to_gross_revenue_ratio?: number | null;
          repeat_referee_excess_ratio?: number | null;
          estimated_net_contribution_zar?: number | null;
        }
      | undefined;

    const spike = spikeByKey.get(key);
    const dupIdentities =
      referrerType === "customer" ? dupByReferrerId.get(referrerId) ?? 0 : 0;

    const scored = computeReferralFraudScore({
      spikeSuspected: spike?.spikeSuspected,
      currentMonthRedemptions: spike?.currentMonthRedemptions,
      avgPrior3MonthsRedemptions: spike?.avgPrior3MonthsRedemptions,
      rewardToGrossRevenueRatio:
        q?.reward_to_gross_revenue_ratio != null ? Number(q.reward_to_gross_revenue_ratio) : null,
      repeatRefereeExcessRatio:
        q?.repeat_referee_excess_ratio != null ? Number(q.repeat_referee_excess_ratio) : null,
      estimatedNetContributionZar:
        q?.estimated_net_contribution_zar != null ? Number(q.estimated_net_contribution_zar) : null,
      duplicateFingerprintIdentities: dupIdentities,
      monthlyRewardCapHit: referrerType === "customer" && capHitReferrerIds.has(referrerId),
    });

    if (scored.riskLevel === "low" && scored.score === 0) continue;

    referrers.push({
      referrerType,
      referrerId,
      displayLabel: labels.get(key) ?? `${referrerId.slice(0, 8)}…`,
      fraudScore: scored.score,
      riskLevel: scored.riskLevel,
      signals: scored.signals.map((s) => ({ code: s.code, label: s.label })),
      currentMonthRedemptions: spike?.currentMonthRedemptions ?? 0,
      estimatedNetContributionZar:
        q?.estimated_net_contribution_zar != null ? Number(q.estimated_net_contribution_zar) : null,
    });
  }

  referrers.sort((a, b) => b.fraudScore - a.fraudScore);

  const highOrCriticalCount = referrers.filter(
    (r) => r.riskLevel === "high" || r.riskLevel === "critical",
  ).length;

  return {
    summary: {
      highOrCriticalCount,
      spikeFlagCount: spikes.data?.length ?? 0,
      duplicateFingerprintCount: duplicateFingerprints.length,
      reconciliationQueueCount: reconCount.count ?? 0,
    },
    referrers: referrers.slice(0, 50),
    duplicateFingerprints,
  };
}
