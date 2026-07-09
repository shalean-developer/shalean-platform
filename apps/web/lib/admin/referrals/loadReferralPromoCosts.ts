import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type ReferralPromoCostTotals = {
  referral_discount_cost_cents: number;
  cleaning_credit_cost_cents: number;
  total_promo_cost_cents: number;
  bookings_with_promo_count: number;
};

export type ReferralPromoCostByBranch = {
  branch_id: string;
  branch_name: string;
  referral_discount_cost_cents: number;
  cleaning_credit_cost_cents: number;
  total_promo_cost_cents: number;
};

type PromoCostRow = {
  booking_id: string;
  date: string | null;
  city_id: string | null;
  referral_discount_zar: number | string | null;
  cleaning_credit_spend_zar: number | string | null;
  total_promo_cost_zar: number | string | null;
};

function zarToCents(zar: number | string | null | undefined): number {
  const n = Number(zar ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

export async function loadReferralPromoCostTotals(
  admin: SupabaseClient,
  from: string,
  to: string,
  branchId?: string,
): Promise<ReferralPromoCostTotals> {
  let query = admin
    .from("admin_booking_promo_costs")
    .select("booking_id, date, city_id, referral_discount_zar, cleaning_credit_spend_zar, total_promo_cost_zar")
    .gte("date", from)
    .lte("date", to);

  if (branchId) query = query.eq("city_id", branchId);

  const { data, error } = await query;
  if (error || !data?.length) {
    return {
      referral_discount_cost_cents: 0,
      cleaning_credit_cost_cents: 0,
      total_promo_cost_cents: 0,
      bookings_with_promo_count: 0,
    };
  }

  let discountCents = 0;
  let creditCents = 0;
  for (const row of data as PromoCostRow[]) {
    discountCents += zarToCents(row.referral_discount_zar);
    creditCents += zarToCents(row.cleaning_credit_spend_zar);
  }

  return {
    referral_discount_cost_cents: discountCents,
    cleaning_credit_cost_cents: creditCents,
    total_promo_cost_cents: discountCents + creditCents,
    bookings_with_promo_count: data.length,
  };
}

export async function loadReferralPromoCostsByBookingIds(
  admin: SupabaseClient,
  bookingIds: string[],
): Promise<Map<string, { referral_discount_cents: number; cleaning_credit_cents: number }>> {
  const out = new Map<string, { referral_discount_cents: number; cleaning_credit_cents: number }>();
  if (!bookingIds.length) return out;

  const unique = [...new Set(bookingIds.filter(Boolean))];
  const chunkSize = 100;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data } = await admin
      .from("admin_booking_promo_costs")
      .select("booking_id, referral_discount_zar, cleaning_credit_spend_zar")
      .in("booking_id", chunk);
    for (const row of (data ?? []) as PromoCostRow[]) {
      out.set(String(row.booking_id), {
        referral_discount_cents: zarToCents(row.referral_discount_zar),
        cleaning_credit_cents: zarToCents(row.cleaning_credit_spend_zar),
      });
    }
  }
  return out;
}

export async function loadReferralPromoCostsByBranch(
  admin: SupabaseClient,
  from: string,
  to: string,
): Promise<ReferralPromoCostByBranch[]> {
  const { data: promoRows, error } = await admin
    .from("admin_booking_promo_costs")
    .select("city_id, referral_discount_zar, cleaning_credit_spend_zar")
    .gte("date", from)
    .lte("date", to);
  if (error || !promoRows?.length) return [];

  const byBranch = new Map<string, { discount: number; credit: number }>();
  for (const row of promoRows as PromoCostRow[]) {
    const bid = String(row.city_id ?? "unknown");
    const cur = byBranch.get(bid) ?? { discount: 0, credit: 0 };
    cur.discount += zarToCents(row.referral_discount_zar);
    cur.credit += zarToCents(row.cleaning_credit_spend_zar);
    byBranch.set(bid, cur);
  }

  const cityIds = [...byBranch.keys()].filter((id) => id !== "unknown");
  const cityNames = new Map<string, string>();
  if (cityIds.length) {
    const { data: cities } = await admin.from("cities").select("id, name").in("id", cityIds);
    for (const c of cities ?? []) {
      cityNames.set(String((c as { id: string }).id), String((c as { name?: string }).name ?? "Unknown"));
    }
  }

  return [...byBranch.entries()]
    .map(([branch_id, costs]) => ({
      branch_id,
      branch_name: cityNames.get(branch_id) ?? (branch_id === "unknown" ? "Unassigned" : branch_id),
      referral_discount_cost_cents: costs.discount,
      cleaning_credit_cost_cents: costs.credit,
      total_promo_cost_cents: costs.discount + costs.credit,
    }))
    .sort((a, b) => b.total_promo_cost_cents - a.total_promo_cost_cents);
}
