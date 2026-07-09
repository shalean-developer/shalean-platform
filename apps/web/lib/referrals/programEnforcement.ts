import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReferralProgramSettings } from "@/lib/referrals/settings";

export async function countRewardedReferralsForCustomer(
  admin: SupabaseClient,
  referrerId: string,
): Promise<number> {
  const { count, error } = await admin
    .from("referrals")
    .select("id", { count: "exact", head: true })
    .eq("referrer_type", "customer")
    .eq("referrer_id", referrerId)
    .in("status", ["completed", "rewarded"]);
  if (error) return 0;
  return count ?? 0;
}

export async function referrerAtMaxRewards(
  admin: SupabaseClient,
  referrerId: string,
  settings: ReferralProgramSettings,
): Promise<boolean> {
  if (settings.maxRewardsPerCustomer == null) return false;
  const count = await countRewardedReferralsForCustomer(admin, referrerId);
  return count >= settings.maxRewardsPerCustomer;
}

export async function referrerHasFinalizedReferralForContact(
  admin: SupabaseClient,
  referredEmailOrPhone: string,
): Promise<boolean> {
  const { data } = await admin
    .from("referrals")
    .select("id")
    .eq("referrer_type", "customer")
    .eq("referred_email_or_phone", referredEmailOrPhone)
    .in("status", ["completed", "rewarded"])
    .maybeSingle();
  return Boolean(data?.id);
}

export function isServiceEligibleForReferral(
  serviceSlug: string | null | undefined,
  settings: ReferralProgramSettings,
): boolean {
  const categories = settings.eligibleServiceCategories;
  if (!categories.length) return true;
  const slug = String(serviceSlug ?? "").trim().toLowerCase();
  if (!slug) return false;
  return categories.some((c) => c.trim().toLowerCase() === slug);
}

export function meetsMinBookingValue(
  bookingTotalZar: number,
  settings: ReferralProgramSettings,
): boolean {
  const min = Math.max(0, Math.round(settings.minBookingValueZar));
  if (min <= 0) return true;
  return Math.round(bookingTotalZar) >= min;
}
