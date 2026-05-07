import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  GlobalMonthlyEconomicsRow,
  QualitySignalRow,
  RedemptionSpikeFlagRow,
  ReferralLeaderboardRow,
  ReferralsDashboardExtras,
} from "@/lib/admin/referralsDashboardExtras.types";
import { buildReferrerDisplayLabel } from "@/lib/admin/referralsReadModelFormat";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";

export type {
  GlobalMonthlyEconomicsRow,
  QualitySignalRow,
  RedemptionSpikeFlagRow,
  ReferralLeaderboardRow,
  ReferralsDashboardExtras,
} from "@/lib/admin/referralsDashboardExtras.types";

type MergedReferrerMetrics = {
  referrer_type: string;
  referrer_id: string;
  gross: number;
  contribution: number;
  conversions: number;
  attributed: number;
};

function rollupKey(referrerType: string, referrerId: string): string {
  return `${referrerType}:${referrerId}`;
}

async function fetchAuthEmailsForUserIds(admin: SupabaseClient, userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(userIds.filter(Boolean))];
  const chunkSize = 25;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (id) => {
        try {
          const { data, error } = await admin.auth.admin.getUserById(id);
          if (error || !data?.user?.email) return;
          const e = normalizeEmail(String(data.user.email));
          if (e) out.set(id, e);
        } catch {
          /* ignore */
        }
      }),
    );
  }
  return out;
}

async function hydrateDisplayLabels(
  admin: SupabaseClient,
  refs: { referrer_type: string; referrer_id: string }[],
): Promise<Map<string, string>> {
  const customerIds = new Set<string>();
  const cleanerIds = new Set<string>();
  for (const r of refs) {
    if (r.referrer_type === "customer") customerIds.add(r.referrer_id);
    if (r.referrer_type === "cleaner") cleanerIds.add(r.referrer_id);
  }

  const [profilesRes, cleanersRes] = await Promise.all([
    customerIds.size
      ? admin.from("user_profiles").select("id, full_name, referral_code").in("id", [...customerIds])
      : Promise.resolve({ data: [] as unknown[], error: null }),
    cleanerIds.size
      ? admin.from("cleaners").select("id, full_name, referral_code, email, phone, phone_number").in("id", [...cleanerIds])
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ]);

  const profileById = new Map<string, { full_name: string | null; referral_code: string | null }>();
  if (!profilesRes.error) {
    for (const p of profilesRes.data ?? []) {
      const row = p as { id?: string; full_name?: string | null; referral_code?: string | null };
      if (row.id) profileById.set(row.id, { full_name: row.full_name ?? null, referral_code: row.referral_code ?? null });
    }
  }
  const cleanerById = new Map<
    string,
    { full_name: string | null; referral_code: string | null; email: string | null; phone: string | null }
  >();
  if (!cleanersRes.error) {
    for (const c of cleanersRes.data ?? []) {
      const row = c as {
        id?: string;
        full_name?: string | null;
        referral_code?: string | null;
        email?: string | null;
        phone?: string | null;
        phone_number?: string | null;
      };
      if (row.id) {
        cleanerById.set(row.id, {
          full_name: row.full_name ?? null,
          referral_code: row.referral_code ?? null,
          email: row.email ?? null,
          phone: String(row.phone_number ?? row.phone ?? "").trim() || null,
        });
      }
    }
  }

  const customerEmails = await fetchAuthEmailsForUserIds(admin, [...customerIds]);
  const labels = new Map<string, string>();

  for (const r of refs) {
    const key = rollupKey(r.referrer_type, r.referrer_id);
    if (labels.has(key)) continue;
    let displayName: string | null = null;
    let referralCode: string | null = null;
    let emailOrPhone: string | null = null;
    if (r.referrer_type === "customer") {
      const p = profileById.get(r.referrer_id);
      displayName = p?.full_name?.trim() || null;
      referralCode = p?.referral_code?.trim() || null;
      emailOrPhone = customerEmails.get(r.referrer_id) ?? null;
    } else {
      const c = cleanerById.get(r.referrer_id);
      displayName = c?.full_name?.trim() || null;
      referralCode = c?.referral_code?.trim() || null;
      emailOrPhone = c?.email?.trim() || c?.phone || null;
    }
    labels.set(
      key,
      buildReferrerDisplayLabel({
        displayName,
        referralCode,
        emailOrPhone,
        fallbackId: r.referrer_id,
      }),
    );
  }
  return labels;
}

function toLeaderboardRow(
  m: MergedReferrerMetrics,
  labels: Map<string, string>,
): ReferralLeaderboardRow {
  const rt = m.referrer_type === "cleaner" ? "cleaner" : "customer";
  const key = rollupKey(m.referrer_type, m.referrer_id);
  const rate = m.attributed >= 2 ? m.conversions / m.attributed : null;
  return {
    referrerType: rt,
    referrerId: m.referrer_id,
    displayLabel: labels.get(key) ?? `${m.referrer_id.slice(0, 8)}…`,
    estimatedNetContributionZar: m.contribution,
    grossReferredRevenueZar: m.gross,
    conversionsCompleted: m.conversions,
    attributedBookings: m.attributed,
    conversionRate: rate,
  };
}

export async function loadReferralsDashboardExtras(
  admin: SupabaseClient,
): Promise<{ ok: true; data: ReferralsDashboardExtras } | { ok: false; error: string }> {
  const [prof, conv, evt, monthly, spikes, qualityBurden] = await Promise.all([
    admin.from("admin_referrer_profitability_rollups").select("*"),
    admin.from("admin_referrer_conversion_rollups").select("*"),
    admin.from("admin_referrer_event_rollups").select("*"),
    admin.from("admin_global_monthly_referral_economics").select("*").order("month_bucket", { ascending: false }).limit(18),
    admin.from("admin_referrer_redemption_spike_flags").select("*").eq("spike_suspected", true).limit(40),
    admin.from("admin_referrer_quality_signals").select("*").limit(120),
  ]);

  if (prof.error) return { ok: false, error: prof.error.message };
  if (conv.error) return { ok: false, error: conv.error.message };
  if (evt.error) return { ok: false, error: evt.error.message };
  if (monthly.error) return { ok: false, error: monthly.error.message };
  if (spikes.error) return { ok: false, error: spikes.error.message };
  if (qualityBurden.error) return { ok: false, error: qualityBurden.error.message };

  const merged = new Map<string, MergedReferrerMetrics>();

  for (const row of prof.data ?? []) {
    const r = row as {
      referrer_type?: string;
      referrer_id?: string;
      gross_referred_revenue_zar?: number | string;
      estimated_net_contribution_zar?: number | string;
    };
    const rt = String(r.referrer_type ?? "");
    const rid = String(r.referrer_id ?? "");
    if (!rt || !rid) continue;
    const key = rollupKey(rt, rid);
    merged.set(key, {
      referrer_type: rt,
      referrer_id: rid,
      gross: Number(r.gross_referred_revenue_zar ?? 0),
      contribution: Number(r.estimated_net_contribution_zar ?? 0),
      conversions: 0,
      attributed: 0,
    });
  }

  for (const row of conv.data ?? []) {
    const r = row as {
      referrer_type?: string;
      referrer_id?: string;
      conversions_completed?: number | string;
    };
    const rt = String(r.referrer_type ?? "");
    const rid = String(r.referrer_id ?? "");
    if (!rt || !rid) continue;
    const key = rollupKey(rt, rid);
    const cur = merged.get(key) ?? {
      referrer_type: rt,
      referrer_id: rid,
      gross: 0,
      contribution: 0,
      conversions: 0,
      attributed: 0,
    };
    cur.conversions = Number(r.conversions_completed ?? 0);
    merged.set(key, cur);
  }

  for (const row of evt.data ?? []) {
    const r = row as {
      referrer_type?: string;
      referrer_id?: string;
      attributed_bookings?: number | string;
    };
    const rt = String(r.referrer_type ?? "");
    const rid = String(r.referrer_id ?? "");
    if (!rt || !rid) continue;
    const key = rollupKey(rt, rid);
    const cur = merged.get(key) ?? {
      referrer_type: rt,
      referrer_id: rid,
      gross: 0,
      contribution: 0,
      conversions: 0,
      attributed: 0,
    };
    cur.attributed = Number(r.attributed_bookings ?? 0);
    merged.set(key, cur);
  }

  const list = [...merged.values()].filter(
    (m) => m.gross > 0 || m.contribution !== 0 || m.conversions > 0 || m.attributed > 0,
  );

  const topContribution = [...list]
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 12);
  const topGross = [...list].sort((a, b) => b.gross - a.gross).slice(0, 12);
  const topConv = [...list]
    .filter((m) => m.attributed >= 2)
    .sort((a, b) => b.conversions / b.attributed - a.conversions / a.attributed)
    .slice(0, 12);

  const customersByContrib = [...list]
    .filter((m) => m.referrer_type === "customer")
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 10);
  const cleanersByContrib = [...list]
    .filter((m) => m.referrer_type === "cleaner")
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 10);

  const hydrateRefs: { referrer_type: string; referrer_id: string }[] = [
    ...topContribution,
    ...topGross,
    ...topConv,
    ...customersByContrib,
    ...cleanersByContrib,
    ...(spikes.data ?? []).map((s) => ({
      referrer_type: String((s as { referrer_type?: string }).referrer_type ?? ""),
      referrer_id: String((s as { referrer_id?: string }).referrer_id ?? ""),
    })),
    ...(qualityBurden.data ?? []).map((s) => ({
      referrer_type: String((s as { referrer_type?: string }).referrer_type ?? ""),
      referrer_id: String((s as { referrer_id?: string }).referrer_id ?? ""),
    })),
  ].filter((x) => x.referrer_type && x.referrer_id);

  const labels = await hydrateDisplayLabels(admin, hydrateRefs);

  const monthlyEconomics: GlobalMonthlyEconomicsRow[] = (monthly.data ?? []).map((row) => {
    const r = row as {
      month_bucket?: string;
      gross_referred_revenue_zar?: number | string;
      total_discount_cost_zar?: number | string;
      total_reward_cost_zar?: number | string;
      estimated_net_contribution_zar?: number | string;
      profitable_booking_count?: number | string;
    };
    return {
      monthBucket: String(r.month_bucket ?? ""),
      grossReferredRevenueZar: Number(r.gross_referred_revenue_zar ?? 0),
      totalDiscountCostZar: Number(r.total_discount_cost_zar ?? 0),
      totalRewardCostZar: Number(r.total_reward_cost_zar ?? 0),
      estimatedNetContributionZar: Number(r.estimated_net_contribution_zar ?? 0),
      profitableBookingCount: Number(r.profitable_booking_count ?? 0),
    };
  });

  const spikeRows: RedemptionSpikeFlagRow[] = (spikes.data ?? []).map((row) => {
    const r = row as {
      referrer_type?: string;
      referrer_id?: string;
      current_month_redemptions?: number | string;
      avg_prior_3_months_redemptions?: number | string;
      spike_suspected?: boolean;
    };
    const rt = r.referrer_type === "cleaner" ? "cleaner" : "customer";
    const rid = String(r.referrer_id ?? "");
    const key = rollupKey(String(r.referrer_type ?? ""), rid);
    return {
      referrerType: rt,
      referrerId: rid,
      displayLabel: labels.get(key) ?? `${rid.slice(0, 8)}…`,
      currentMonthRedemptions: Number(r.current_month_redemptions ?? 0),
      avgPrior3MonthsRedemptions: Number(r.avg_prior_3_months_redemptions ?? 0),
      spikeSuspected: Boolean(r.spike_suspected),
    };
  });

  const qualityParsed = (qualityBurden.data ?? [])
    .map((row) => {
      const r = row as {
        referrer_type?: string;
        referrer_id?: string;
        repeat_referee_excess_ratio?: number | string | null;
        reward_to_gross_revenue_ratio?: number | string | null;
        conversion_to_attributed_booking_ratio?: number | string | null;
        gross_referred_revenue_zar?: number | string | null;
        estimated_net_contribution_zar?: number | string | null;
      };
      const gross = r.gross_referred_revenue_zar == null ? 0 : Number(r.gross_referred_revenue_zar);
      const rwRaw = r.reward_to_gross_revenue_ratio;
      const rw = rwRaw == null || rwRaw === "" ? null : Number(rwRaw);
      return { r, gross, rw };
    })
    .filter((x) => x.gross >= 1 && x.rw != null && Number.isFinite(x.rw))
    .sort((a, b) => (b.rw ?? 0) - (a.rw ?? 0))
    .slice(0, 12);

  const qualityRows: QualitySignalRow[] = qualityParsed.map(({ r }) => {
    const rt = r.referrer_type === "cleaner" ? "cleaner" : "customer";
    const rid = String(r.referrer_id ?? "");
    const key = rollupKey(String(r.referrer_type ?? ""), rid);
    const rr = r.repeat_referee_excess_ratio;
    const rw = r.reward_to_gross_revenue_ratio;
    const cb = r.conversion_to_attributed_booking_ratio;
    return {
      referrerType: rt,
      referrerId: rid,
      displayLabel: labels.get(key) ?? `${rid.slice(0, 8)}…`,
      repeatRefereeExcessRatio: rr == null || rr === "" ? null : Number(rr),
      rewardToGrossRevenueRatio: rw == null || rw === "" ? null : Number(rw),
      conversionToAttributedBookingRatio: cb == null || cb === "" ? null : Number(cb),
      grossReferredRevenueZar:
        r.gross_referred_revenue_zar == null ? null : Number(r.gross_referred_revenue_zar),
      estimatedNetContributionZar:
        r.estimated_net_contribution_zar == null ? null : Number(r.estimated_net_contribution_zar),
    };
  });

  return {
    ok: true,
    data: {
      leaderboards: {
        topByEstimatedContribution: topContribution.map((m) => toLeaderboardRow(m, labels)),
        topCustomersByContribution: customersByContrib.map((m) => toLeaderboardRow(m, labels)),
        topCleanersByContribution: cleanersByContrib.map((m) => toLeaderboardRow(m, labels)),
        topByConversionRate: topConv.map((m) => toLeaderboardRow(m, labels)),
        topByGrossRevenue: topGross.map((m) => toLeaderboardRow(m, labels)),
      },
      monthlyEconomics,
      spikeFlags: spikeRows,
      qualityHighRewardBurden: qualityRows,
    },
  };
}
