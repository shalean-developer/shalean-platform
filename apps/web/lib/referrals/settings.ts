import type { SupabaseClient } from "@supabase/supabase-js";

export type ReferralProgramSettings = {
  enabled: boolean;
  rewardAmountZar: number;
  checkoutDiscountZar: number;
  minBookingValueZar: number;
  rewardOn: "first_paid_booking" | "first_completed_booking";
  rewardExpiryDays: number | null;
  maxRewardsPerCustomer: number | null;
  allowMultipleReferrals: boolean;
  eligibleServiceCategories: string[];
  heroHeadline: string;
  heroSubheading: string;
  promotionalText: string | null;
  termsAndConditions: string | null;
};

const DEFAULTS: ReferralProgramSettings = {
  enabled: true,
  rewardAmountZar: 50,
  checkoutDiscountZar: 50,
  minBookingValueZar: 0,
  rewardOn: "first_paid_booking",
  rewardExpiryDays: null,
  maxRewardsPerCustomer: null,
  allowMultipleReferrals: true,
  eligibleServiceCategories: [],
  heroHeadline: "Love Our Cleaning? Get Rewarded for Sharing Shalean!",
  heroSubheading:
    "Refer your friends, neighbours, family members, or colleagues. When they complete their first cleaning with Shalean, you'll earn Cleaning Credit towards your next booking.",
  promotionalText: null,
  termsAndConditions: null,
};

type SettingsRow = {
  enabled?: boolean;
  reward_amount_zar?: number;
  checkout_discount_zar?: number;
  min_booking_value_zar?: number;
  reward_on?: string;
  reward_expiry_days?: number | null;
  max_rewards_per_customer?: number | null;
  allow_multiple_referrals?: boolean;
  eligible_service_categories?: string[] | null;
  hero_headline?: string;
  hero_subheading?: string;
  promotional_text?: string | null;
  terms_and_conditions?: string | null;
};

function mapRow(row: SettingsRow | null): ReferralProgramSettings {
  if (!row) return { ...DEFAULTS };
  return {
    enabled: row.enabled ?? DEFAULTS.enabled,
    rewardAmountZar: Number(row.reward_amount_zar ?? DEFAULTS.rewardAmountZar),
    checkoutDiscountZar: Number(row.checkout_discount_zar ?? DEFAULTS.checkoutDiscountZar),
    minBookingValueZar: Number(row.min_booking_value_zar ?? DEFAULTS.minBookingValueZar),
    rewardOn:
      row.reward_on === "first_completed_booking" ? "first_completed_booking" : "first_paid_booking",
    rewardExpiryDays:
      row.reward_expiry_days != null && Number.isFinite(Number(row.reward_expiry_days))
        ? Math.max(1, Math.round(Number(row.reward_expiry_days)))
        : null,
    maxRewardsPerCustomer:
      row.max_rewards_per_customer != null && Number.isFinite(Number(row.max_rewards_per_customer))
        ? Math.max(1, Math.round(Number(row.max_rewards_per_customer)))
        : null,
    allowMultipleReferrals: row.allow_multiple_referrals ?? DEFAULTS.allowMultipleReferrals,
    eligibleServiceCategories: Array.isArray(row.eligible_service_categories)
      ? row.eligible_service_categories.filter((s) => typeof s === "string")
      : [],
    heroHeadline: row.hero_headline ?? DEFAULTS.heroHeadline,
    heroSubheading: row.hero_subheading ?? DEFAULTS.heroSubheading,
    promotionalText: row.promotional_text ?? null,
    termsAndConditions: row.terms_and_conditions ?? null,
  };
}

export async function getReferralProgramSettings(
  admin: SupabaseClient,
): Promise<ReferralProgramSettings> {
  const { data } = await admin.from("referral_program_settings").select("*").eq("id", "default").maybeSingle();
  return mapRow(data as SettingsRow | null);
}

export async function updateReferralProgramSettings(
  admin: SupabaseClient,
  patch: Partial<ReferralProgramSettings>,
): Promise<{ ok: true; settings: ReferralProgramSettings } | { ok: false; error: string }> {
  const current = await getReferralProgramSettings(admin);
  const merged = { ...current, ...patch };
  const { error } = await admin.from("referral_program_settings").upsert(
    {
      id: "default",
      enabled: merged.enabled,
      reward_amount_zar: merged.rewardAmountZar,
      checkout_discount_zar: merged.checkoutDiscountZar,
      min_booking_value_zar: merged.minBookingValueZar,
      reward_on: merged.rewardOn,
      reward_expiry_days: merged.rewardExpiryDays,
      max_rewards_per_customer: merged.maxRewardsPerCustomer,
      allow_multiple_referrals: merged.allowMultipleReferrals,
      eligible_service_categories: merged.eligibleServiceCategories,
      hero_headline: merged.heroHeadline,
      hero_subheading: merged.heroSubheading,
      promotional_text: merged.promotionalText,
      terms_and_conditions: merged.termsAndConditions,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true, settings: merged };
}

/** Cached settings for hot paths — short TTL in-memory. */
let cachedSettings: { at: number; value: ReferralProgramSettings } | null = null;
const CACHE_TTL_MS = 30_000;

export async function getReferralProgramSettingsCached(
  admin: SupabaseClient,
): Promise<ReferralProgramSettings> {
  if (cachedSettings && Date.now() - cachedSettings.at < CACHE_TTL_MS) {
    return cachedSettings.value;
  }
  const value = await getReferralProgramSettings(admin);
  cachedSettings = { at: Date.now(), value };
  return value;
}

export function invalidateReferralSettingsCache(): void {
  cachedSettings = null;
}
