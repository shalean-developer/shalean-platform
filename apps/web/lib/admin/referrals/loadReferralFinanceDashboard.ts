import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeOfficePayoutPeriodRange } from "@/lib/admin/payouts/officePayoutPeriodReport";
import {
  adminDashboardRevenueCents,
  isAdminDashboardRevenueEligible,
  type AdminDashboardRevenueRow,
} from "@/lib/admin/dashboardRevenue";
import { johannesburgDayUtcBounds } from "@/lib/admin/metrics";
import { loadReferralPromoCostTotals, loadReferralPromoCostsByBranch } from "@/lib/admin/referrals/loadReferralPromoCosts";

export type ReferralFinanceDashboardPayload = {
  period: { from: string; to: string };
  summary: {
    paid_attributed_revenue_cents: number;
    completed_referred_revenue_cents: number;
    gross_referred_revenue_cents: number;
    referral_discount_cost_cents: number;
    cleaning_credit_cost_cents: number;
    total_referral_cost_cents: number;
    estimated_net_contribution_cents: number;
    referral_roi_percent: number | null;
    payback_period_days: number | null;
    new_customers_from_referrals: number;
    successful_referrals: number;
    conversion_rate_percent: number | null;
    avg_referral_value_cents: number;
    avg_reward_cents: number;
  };
  monthly_trend: Array<{
    month: string;
    referred_revenue_cents: number;
    discount_cost_cents: number;
    reward_cost_cents: number;
    net_contribution_cents: number;
    referral_count: number;
  }>;
  top_referrers: Array<{
    referrer_id: string;
    referrer_type: string;
    gross_revenue_cents: number;
    total_cost_cents: number;
    net_contribution_cents: number;
    referral_count: number;
  }>;
  by_branch: Array<{
    branch_id: string;
    branch_name: string;
    referral_discount_cost_cents: number;
    cleaning_credit_cost_cents: number;
    total_promo_cost_cents: number;
  }>;
  reconciliation_queue_count: number;
};

function zarBigIntToCents(zar: number | string | null | undefined): number {
  const n = Number(zar ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

async function loadPeriodReferralEvents(
  admin: SupabaseClient,
  eventType: "checkout_discount_applied" | "referral_reward_credited",
  startIso: string,
  endExclusiveIso: string,
): Promise<Array<{ id: string; booking_id: string | null; value_zar: number | string | null }>> {
  const rows: Array<{ id: string; booking_id: string | null; value_zar: number | string | null }> = [];
  const pageSize = 1000;
  for (let fromIndex = 0; ; fromIndex += pageSize) {
    const { data, error } = await admin
      .from("referral_events")
      .select("id, booking_id, value_zar")
      .eq("event_type", eventType)
      .gte("created_at", startIso)
      .lt("created_at", endExclusiveIso)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(fromIndex, fromIndex + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as typeof rows));
    if ((data?.length ?? 0) < pageSize) break;
  }
  return rows;
}

async function loadAttributedBookings(
  admin: SupabaseClient,
  bookingIds: string[],
): Promise<AdminDashboardRevenueRow[]> {
  const rows: AdminDashboardRevenueRow[] = [];
  const unique = [...new Set(bookingIds.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 100) {
    const { data, error } = await admin
      .from("bookings")
      .select(
        "id,status,payment_status,payment_completed_at,total_paid_zar,amount_paid_cents,refunded_at,refund_status,billing_type,is_monthly_billing_booking,monthly_invoice_id",
      )
      .in("id", unique.slice(i, i + 100));
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as AdminDashboardRevenueRow[]));
  }
  return rows;
}

export async function loadReferralFinanceDashboard(
  admin: SupabaseClient,
  fromRaw?: string | null,
  toRaw?: string | null,
): Promise<ReferralFinanceDashboardPayload> {
  const { from, to } = normalizeOfficePayoutPeriodRange(fromRaw, toRaw);
  const startIso = johannesburgDayUtcBounds(from).startIso;
  const endExclusiveIso = johannesburgDayUtcBounds(to).endExclusiveIso;

  const [promoTotals, byBranch, globalMonthly, profitability, conversion, reconCount, rewards] =
    await Promise.all([
      loadReferralPromoCostTotals(admin, from, to),
      loadReferralPromoCostsByBranch(admin, from, to),
      admin
        .from("admin_global_monthly_referral_economics")
        .select("*")
        .gte("month_bucket", `${from.slice(0, 7)}-01`)
        .lte("month_bucket", `${to.slice(0, 7)}-31`)
        .order("month_bucket", { ascending: true }),
      admin
        .from("admin_referrer_profitability_rollups")
        .select(
          "referrer_id, referrer_type, gross_referred_revenue_zar, total_discount_cost_zar, total_reward_cost_zar, estimated_net_contribution_zar, profitable_booking_count",
        )
        .order("estimated_net_contribution_zar", { ascending: false })
        .limit(10),
      admin
        .from("admin_referrer_conversion_rollups")
        .select("conversions_completed, distinct_referee_count"),
      admin
        .from("admin_referral_reconciliation_queue")
        .select("booking_id", { count: "exact", head: true }),
      admin
        .from("referrals")
        .select("id", { count: "exact", head: true })
        .eq("referrer_type", "customer")
        .eq("status", "rewarded")
        .gte("rewarded_at", startIso)
        .lt("rewarded_at", endExclusiveIso),
    ]);

  const [attributionEvents, rewardEvents] = await Promise.all([
    loadPeriodReferralEvents(admin, "checkout_discount_applied", startIso, endExclusiveIso),
    loadPeriodReferralEvents(admin, "referral_reward_credited", startIso, endExclusiveIso),
  ]);
  const attributedBookingIds = [
    ...new Set(
      attributionEvents
        .map((row) => String((row as { booking_id?: string | null }).booking_id ?? "").trim())
        .filter(Boolean),
    ),
  ];
  const attributedBookings = await loadAttributedBookings(admin, attributedBookingIds);

  let paidAttributedRevenueCents = 0;
  let completedReferredRevenueCents = 0;
  for (const booking of attributedBookings) {
    if (!isAdminDashboardRevenueEligible(booking)) continue;
    const revenueCents = adminDashboardRevenueCents(booking);
    paidAttributedRevenueCents += revenueCents;
    if (String(booking.status ?? "").trim().toLowerCase() === "completed") {
      completedReferredRevenueCents += revenueCents;
    }
  }

  const grossRevenueCents = completedReferredRevenueCents;
  const discountCostCents = promoTotals.referral_discount_cost_cents;
  const rewardCostCents = rewardEvents.reduce(
    (sum, row) => sum + zarBigIntToCents((row as { value_zar?: number | string | null }).value_zar),
    0,
  );

  // Use promo totals for discount (more accurate for period) and reward rollups for credits issued
  const totalCostCents = discountCostCents + rewardCostCents + promoTotals.cleaning_credit_cost_cents;
  const netContributionCents = grossRevenueCents - totalCostCents;

  const successfulReferrals = rewards.count ?? 0;
  let totalConversions = 0;
  let totalReferees = 0;
  for (const row of conversion.data ?? []) {
    totalConversions += Number((row as { conversions_completed?: number }).conversions_completed ?? 0);
    totalReferees += Number((row as { distinct_referee_count?: number }).distinct_referee_count ?? 0);
  }

  const conversionRate =
    totalReferees > 0 ? Math.round((totalConversions / totalReferees) * 10000) / 100 : null;

  const roiPercent =
    totalCostCents > 0 ? Math.round((netContributionCents / totalCostCents) * 10000) / 100 : null;

  const avgReferralValue =
    successfulReferrals > 0 ? Math.round(grossRevenueCents / successfulReferrals) : 0;
  const avgReward = successfulReferrals > 0 ? Math.round(rewardCostCents / successfulReferrals) : 0;

  const monthlyTrend = (globalMonthly.data ?? []).map((row) => {
    const r = row as {
      month_bucket?: string;
      gross_referred_revenue_zar?: number;
      total_discount_cost_zar?: number;
      total_reward_cost_zar?: number;
      estimated_net_contribution_zar?: number;
      profitable_booking_count?: number;
    };
    return {
      month: String(r.month_bucket ?? "").slice(0, 7),
      referred_revenue_cents: zarBigIntToCents(r.gross_referred_revenue_zar),
      discount_cost_cents: zarBigIntToCents(r.total_discount_cost_zar),
      reward_cost_cents: zarBigIntToCents(r.total_reward_cost_zar),
      net_contribution_cents: zarBigIntToCents(r.estimated_net_contribution_zar),
      referral_count: Number(r.profitable_booking_count ?? 0),
    };
  });

  const topReferrers = (profitability.data ?? []).slice(0, 5).map((row) => {
    const r = row as {
      referrer_id: string;
      referrer_type: string;
      gross_referred_revenue_zar?: number;
      total_discount_cost_zar?: number;
      total_reward_cost_zar?: number;
      estimated_net_contribution_zar?: number;
      profitable_booking_count?: number;
    };
    const cost =
      zarBigIntToCents(r.total_discount_cost_zar) + zarBigIntToCents(r.total_reward_cost_zar);
    return {
      referrer_id: r.referrer_id,
      referrer_type: r.referrer_type,
      gross_revenue_cents: zarBigIntToCents(r.gross_referred_revenue_zar),
      total_cost_cents: cost,
      net_contribution_cents: zarBigIntToCents(r.estimated_net_contribution_zar),
      referral_count: Number(r.profitable_booking_count ?? 0),
    };
  });

  return {
    period: { from, to },
    summary: {
      paid_attributed_revenue_cents: paidAttributedRevenueCents,
      completed_referred_revenue_cents: completedReferredRevenueCents,
      gross_referred_revenue_cents: grossRevenueCents,
      referral_discount_cost_cents: discountCostCents,
      cleaning_credit_cost_cents: promoTotals.cleaning_credit_cost_cents,
      total_referral_cost_cents: totalCostCents,
      estimated_net_contribution_cents: netContributionCents,
      referral_roi_percent: roiPercent,
      payback_period_days: null,
      new_customers_from_referrals: totalReferees,
      successful_referrals: successfulReferrals,
      conversion_rate_percent: conversionRate,
      avg_referral_value_cents: avgReferralValue,
      avg_reward_cents: avgReward,
    },
    monthly_trend: monthlyTrend,
    top_referrers: topReferrers,
    by_branch: byBranch,
    reconciliation_queue_count: reconCount.count ?? 0,
  };
}
