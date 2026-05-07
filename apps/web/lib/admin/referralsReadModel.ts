import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { buildReferrerDisplayLabel, rollupKey } from "@/lib/admin/referralsReadModelFormat";
import type { AdminReferralRow } from "@/lib/admin/referralsReadModel.types";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";

export type { AdminReferralRow } from "@/lib/admin/referralsReadModel.types";

type ReferralRaw = {
  id: string;
  referrer_id: string;
  referrer_type: string;
  referred_email_or_phone: string | null;
  referred_user_id: string | null;
  status: string | null;
  reward_amount: number | string | null;
  created_at: string;
  completed_at: string | null;
  rewarded_at: string | null;
  code: string | null;
};

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
          /* ignore missing users */
        }
      }),
    );
  }
  return out;
}

export async function buildAdminReferralsReadModel(
  admin: SupabaseClient,
): Promise<
  | { ok: true; rows: AdminReferralRow[] }
  | { ok: false; error: string }
> {
  const [
    referralsRes,
    redemptionRollRes,
    eventRollRes,
    rewardRollRes,
    conversionRollRes,
    profitabilityRollRes,
  ] = await Promise.all([
    admin
      .from("referrals")
      .select(
        "id, referrer_id, referrer_type, referred_email_or_phone, referred_user_id, status, reward_amount, created_at, completed_at, rewarded_at, code",
      )
      .order("rewarded_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(2000),
    admin.from("admin_referrer_redemption_rollups").select("referrer_type, referrer_id, redemption_count, total_discount_zar"),
    admin
      .from("admin_referrer_event_rollups")
      .select("referrer_type, referrer_id, attributed_bookings, cleaner_checkout_attribution_count"),
    admin
      .from("admin_referrer_reward_rollups")
      .select(
        "referrer_type, referrer_id, rewards_credited_count, total_rewards_zar, avg_reward_zar, latest_reward_at, customer_reward_count, cleaner_reward_count",
      ),
    admin
      .from("admin_referrer_conversion_rollups")
      .select(
        "referrer_type, referrer_id, conversions_completed, distinct_referee_count, latest_conversion_at, customer_conversion_count, cleaner_conversion_count",
      ),
    admin
      .from("admin_referrer_profitability_rollups")
      .select(
        "referrer_type, referrer_id, gross_referred_revenue_zar, total_discount_cost_zar, total_reward_cost_zar, estimated_net_contribution_zar, profitable_booking_count, avg_booking_value_zar, latest_profitable_booking_at",
      ),
  ]);

  if (referralsRes.error) return { ok: false, error: referralsRes.error.message };
  if (redemptionRollRes.error) return { ok: false, error: redemptionRollRes.error.message };
  if (eventRollRes.error) return { ok: false, error: eventRollRes.error.message };
  if (rewardRollRes.error) return { ok: false, error: rewardRollRes.error.message };
  if (conversionRollRes.error) return { ok: false, error: conversionRollRes.error.message };
  if (profitabilityRollRes.error) return { ok: false, error: profitabilityRollRes.error.message };

  const rawRows = (referralsRes.data ?? []) as ReferralRaw[];

  const customerIds = new Set<string>();
  const cleanerIds = new Set<string>();
  for (const r of rawRows) {
    if (r.referrer_type === "customer") customerIds.add(r.referrer_id);
    if (r.referrer_type === "cleaner") cleanerIds.add(r.referrer_id);
  }

  const redemptionMap = new Map<
    string,
    { redemptionCount: number; totalDiscountZar: number }
  >();
  for (const row of redemptionRollRes.data ?? []) {
    const rec = row as {
      referrer_type?: string;
      referrer_id?: string;
      redemption_count?: number | string;
      total_discount_zar?: number | string;
    };
    const rt = String(rec.referrer_type ?? "");
    const rid = String(rec.referrer_id ?? "");
    if (!rt || !rid) continue;
    redemptionMap.set(rollupKey(rt, rid), {
      redemptionCount: Number(rec.redemption_count ?? 0),
      totalDiscountZar: Number(rec.total_discount_zar ?? 0),
    });
  }

  const eventMap = new Map<
    string,
    { attributedBookings: number; cleanerCheckoutAttributionCount: number }
  >();
  for (const row of eventRollRes.data ?? []) {
    const rec = row as {
      referrer_type?: string;
      referrer_id?: string;
      attributed_bookings?: number | string;
      cleaner_checkout_attribution_count?: number | string;
    };
    const rt = String(rec.referrer_type ?? "");
    const rid = String(rec.referrer_id ?? "");
    if (!rt || !rid) continue;
    eventMap.set(rollupKey(rt, rid), {
      attributedBookings: Number(rec.attributed_bookings ?? 0),
      cleanerCheckoutAttributionCount: Number(rec.cleaner_checkout_attribution_count ?? 0),
    });
  }

  const rewardMap = new Map<
    string,
    {
      rewardsCreditedCount: number;
      totalRewardsZar: number;
      avgRewardZar: number | null;
      latestRewardAt: string | null;
      customerRewardCount: number;
      cleanerRewardCount: number;
    }
  >();
  for (const row of rewardRollRes.data ?? []) {
    const rec = row as {
      referrer_type?: string;
      referrer_id?: string;
      rewards_credited_count?: number | string;
      total_rewards_zar?: number | string;
      avg_reward_zar?: number | string | null;
      latest_reward_at?: string | null;
      customer_reward_count?: number | string;
      cleaner_reward_count?: number | string;
    };
    const rt = String(rec.referrer_type ?? "");
    const rid = String(rec.referrer_id ?? "");
    if (!rt || !rid) continue;
    const avgRaw = rec.avg_reward_zar;
    const avgRewardZar =
      avgRaw == null || avgRaw === "" ? null : Number(avgRaw);
    rewardMap.set(rollupKey(rt, rid), {
      rewardsCreditedCount: Number(rec.rewards_credited_count ?? 0),
      totalRewardsZar: Number(rec.total_rewards_zar ?? 0),
      avgRewardZar: avgRewardZar != null && Number.isFinite(avgRewardZar) ? avgRewardZar : null,
      latestRewardAt: rec.latest_reward_at ? String(rec.latest_reward_at) : null,
      customerRewardCount: Number(rec.customer_reward_count ?? 0),
      cleanerRewardCount: Number(rec.cleaner_reward_count ?? 0),
    });
  }

  const conversionMap = new Map<
    string,
    {
      conversionsCompleted: number;
      distinctRefereeCount: number;
      latestConversionAt: string | null;
      customerConversionCount: number;
      cleanerConversionCount: number;
    }
  >();
  for (const row of conversionRollRes.data ?? []) {
    const rec = row as {
      referrer_type?: string;
      referrer_id?: string;
      conversions_completed?: number | string;
      distinct_referee_count?: number | string;
      latest_conversion_at?: string | null;
      customer_conversion_count?: number | string;
      cleaner_conversion_count?: number | string;
    };
    const rt = String(rec.referrer_type ?? "");
    const rid = String(rec.referrer_id ?? "");
    if (!rt || !rid) continue;
    conversionMap.set(rollupKey(rt, rid), {
      conversionsCompleted: Number(rec.conversions_completed ?? 0),
      distinctRefereeCount: Number(rec.distinct_referee_count ?? 0),
      latestConversionAt: rec.latest_conversion_at ? String(rec.latest_conversion_at) : null,
      customerConversionCount: Number(rec.customer_conversion_count ?? 0),
      cleanerConversionCount: Number(rec.cleaner_conversion_count ?? 0),
    });
  }

  const profitabilityMap = new Map<
    string,
    {
      grossReferredRevenueZar: number;
      totalDiscountCostZar: number;
      totalRewardCostZar: number;
      estimatedNetContributionZar: number;
      profitableBookingCount: number;
      avgBookingValueZar: number | null;
      latestProfitableBookingAt: string | null;
    }
  >();
  for (const row of profitabilityRollRes.data ?? []) {
    const rec = row as {
      referrer_type?: string;
      referrer_id?: string;
      gross_referred_revenue_zar?: number | string;
      total_discount_cost_zar?: number | string;
      total_reward_cost_zar?: number | string;
      estimated_net_contribution_zar?: number | string;
      profitable_booking_count?: number | string;
      avg_booking_value_zar?: number | string | null;
      latest_profitable_booking_at?: string | null;
    };
    const rt = String(rec.referrer_type ?? "");
    const rid = String(rec.referrer_id ?? "");
    if (!rt || !rid) continue;
    const avgRaw = rec.avg_booking_value_zar;
    const avgBooking =
      avgRaw == null || avgRaw === "" ? null : Number(avgRaw);
    profitabilityMap.set(rollupKey(rt, rid), {
      grossReferredRevenueZar: Number(rec.gross_referred_revenue_zar ?? 0),
      totalDiscountCostZar: Number(rec.total_discount_cost_zar ?? 0),
      totalRewardCostZar: Number(rec.total_reward_cost_zar ?? 0),
      estimatedNetContributionZar: Number(rec.estimated_net_contribution_zar ?? 0),
      profitableBookingCount: Number(rec.profitable_booking_count ?? 0),
      avgBookingValueZar: avgBooking != null && Number.isFinite(avgBooking) ? avgBooking : null,
      latestProfitableBookingAt: rec.latest_profitable_booking_at
        ? String(rec.latest_profitable_booking_at)
        : null,
    });
  }

  const profilesPromise =
    customerIds.size > 0
      ? admin.from("user_profiles").select("id, full_name, referral_code").in("id", [...customerIds])
      : Promise.resolve({ data: [] as unknown[], error: null });
  const cleanersPromise =
    cleanerIds.size > 0
      ? admin.from("cleaners").select("id, full_name, referral_code, email, phone, phone_number").in("id", [...cleanerIds])
      : Promise.resolve({ data: [] as unknown[], error: null });

  const [profilesRes, cleanersRes] = await Promise.all([profilesPromise, cleanersPromise]);

  if (profilesRes.error) return { ok: false, error: profilesRes.error.message };
  if (cleanersRes.error) return { ok: false, error: cleanersRes.error.message };

  const profileById = new Map<string, { full_name: string | null; referral_code: string | null }>();
  for (const p of profilesRes.data ?? []) {
    const row = p as { id?: string; full_name?: string | null; referral_code?: string | null };
    if (row.id) profileById.set(row.id, { full_name: row.full_name ?? null, referral_code: row.referral_code ?? null });
  }

  const cleanerById = new Map<
    string,
    { full_name: string | null; referral_code: string | null; email: string | null; phone: string | null }
  >();
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

  const customerEmails = await fetchAuthEmailsForUserIds(admin, [...customerIds]);

  const rows: AdminReferralRow[] = rawRows.map((r) => {
    const key = rollupKey(r.referrer_type, r.referrer_id);
    const redRoll = redemptionMap.get(key);
    const evRoll = eventMap.get(key);
    const rwRoll = rewardMap.get(key);
    const convRoll = conversionMap.get(key);
    const profRoll = profitabilityMap.get(key);
    const reward = Number(r.reward_amount ?? 0);

    let displayName: string | null = null;
    let referralCode: string | null = null;
    let emailOrPhone: string | null = null;

    if (r.referrer_type === "customer") {
      const p = profileById.get(r.referrer_id);
      displayName = p?.full_name?.trim() || null;
      referralCode = (p?.referral_code ?? r.code)?.trim() || null;
      emailOrPhone = customerEmails.get(r.referrer_id) ?? null;
    } else {
      const c = cleanerById.get(r.referrer_id);
      displayName = c?.full_name?.trim() || null;
      referralCode = (c?.referral_code ?? r.code)?.trim() || null;
      emailOrPhone = c?.email?.trim() || c?.phone || null;
    }

    const displayLabel = buildReferrerDisplayLabel({
      displayName,
      referralCode,
      emailOrPhone,
      fallbackId: r.referrer_id,
    });

    return {
      id: r.id,
      referrer: {
        id: r.referrer_id,
        type: r.referrer_type === "cleaner" ? "cleaner" : "customer",
        displayLabel,
        displayName,
        referralCode,
        emailOrPhone,
      },
      referred: {
        userId: r.referred_user_id,
        emailOrPhone: r.referred_email_or_phone ? String(r.referred_email_or_phone) : null,
      },
      lifecycle: {
        status: String(r.status ?? ""),
        rewardAmount: reward,
        createdAt: r.created_at,
        completedAt: r.completed_at,
        rewardedAt: r.rewarded_at,
        codeSnapshot: r.code ? String(r.code).trim() : null,
      },
      analytics: {
        totalCheckoutDiscountsZar: redRoll?.totalDiscountZar ?? 0,
        redemptionCount: redRoll?.redemptionCount ?? 0,
        attributedBookings: evRoll?.attributedBookings ?? 0,
        cleanerCheckoutAttributionCount: evRoll?.cleanerCheckoutAttributionCount ?? 0,
        rewardsCreditedCount: rwRoll?.rewardsCreditedCount ?? 0,
        totalRewardsZar: rwRoll?.totalRewardsZar ?? 0,
        avgRewardZar: rwRoll?.avgRewardZar ?? null,
        latestRewardAt: rwRoll?.latestRewardAt ?? null,
        customerRewardCount: rwRoll?.customerRewardCount ?? 0,
        cleanerRewardCount: rwRoll?.cleanerRewardCount ?? 0,
        conversionsCompleted: convRoll?.conversionsCompleted ?? 0,
        distinctRefereeCount: convRoll?.distinctRefereeCount ?? 0,
        latestConversionAt: convRoll?.latestConversionAt ?? null,
        customerConversionCount: convRoll?.customerConversionCount ?? 0,
        cleanerConversionCount: convRoll?.cleanerConversionCount ?? 0,
        profitability: {
          grossReferredRevenueZar: profRoll?.grossReferredRevenueZar ?? 0,
          totalDiscountCostZar: profRoll?.totalDiscountCostZar ?? 0,
          totalRewardCostZar: profRoll?.totalRewardCostZar ?? 0,
          estimatedNetContributionZar: profRoll?.estimatedNetContributionZar ?? 0,
          profitableBookingCount: profRoll?.profitableBookingCount ?? 0,
          avgBookingValueZar: profRoll?.avgBookingValueZar ?? null,
          latestProfitableBookingAt: profRoll?.latestProfitableBookingAt ?? null,
        },
      },
    };
  });

  return { ok: true, rows };
}
