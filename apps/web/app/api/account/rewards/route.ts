import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveBookingRouteBearerAuth } from "@/lib/supabase/bookingRouteBearerAuth";
import { getCreditSummary, getCreditTransactionHistory } from "@/lib/referrals/credits";
import { getActiveDisplayPromotions, getActiveMembershipDiscountPercent } from "@/lib/promotions/server";
import { getActiveBirthdayRewardForUser } from "@/lib/promotions/birthday";
import { loadBundlesForPromotions } from "@/lib/promotions/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Customer Rewards & Offers hub payload. */
export async function GET(request: Request) {
  const auth = await resolveBookingRouteBearerAuth(request);
  if (auth.kind === "invalid_token") {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  if (auth.kind !== "authenticated") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const userId = auth.userId;

  const [
    activePromos,
    credit,
    history,
    birthday,
    membershipPct,
    { data: membership },
    { data: profile },
  ] = await Promise.all([
    getActiveDisplayPromotions(admin, "booking"),
    getCreditSummary(admin, userId),
    getCreditTransactionHistory(admin, userId, 30),
    getActiveBirthdayRewardForUser(admin, userId),
    getActiveMembershipDiscountPercent(admin, userId),
    admin
      .from("customer_memberships")
      .select("*, membership_plans(name, slug, discount_percent, billing_frequency, benefits)")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle(),
    admin.from("user_profiles").select("date_of_birth, tier, credit_balance_zar").eq("id", userId).maybeSingle(),
  ]);

  const homepage = await getActiveDisplayPromotions(admin, "homepage");
  const seasonal = [...activePromos, ...homepage].filter(
    (p, i, arr) => p.promotion_type === "seasonal" && arr.findIndex((x) => x.id === p.id) === i,
  );

  const bundlePromos = activePromos.filter((p) => p.promotion_type === "bundle");
  const bundles = await loadBundlesForPromotions(
    admin,
    bundlePromos.map((p) => p.id),
  );

  const expiringRewards: { type: string; label: string; amountZar: number; expiresAt: string }[] = [];
  if (birthday) {
    expiringRewards.push({
      type: "birthday",
      label: "Birthday Cleaning Credit",
      amountZar: birthday.creditZar,
      expiresAt: birthday.expiresAt,
    });
  }
  if (credit.nextExpiryAt && credit.balance > 0) {
    expiringRewards.push({
      type: "cleaning_credit",
      label: "Cleaning Credit",
      amountZar: credit.balance,
      expiresAt: credit.nextExpiryAt,
    });
  }

  return NextResponse.json({
    activePromotions: activePromos
      .filter((p) => !["referral", "birthday"].includes(p.promotion_type) || p.show_on_booking)
      .map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        description: p.description,
        type: p.promotion_type,
        headline: p.display_config.headline ?? p.name,
        cta: p.display_config.cta,
        endsAt: p.ends_at,
        promoCode: p.promo_code,
        discountType: p.discount_type,
        discountValue: p.discount_value,
        landingPagePath: p.landing_page_path,
      })),
    seasonalOffers: seasonal.map((p) => ({
      id: p.id,
      name: p.name,
      headline: p.display_config.headline ?? p.name,
      endsAt: p.ends_at,
      colours: p.display_config.colours,
      landingPagePath: p.landing_page_path,
      promoCode: p.promo_code,
    })),
    referralCredits: {
      balanceZar: credit.balance,
      totalEarnedZar: credit.totalEarned,
      totalUsedZar: credit.totalUsed,
      nextExpiryAt: credit.nextExpiryAt,
    },
    birthdayReward: birthday,
    membership: membership
      ? {
          status: membership.status,
          savingsToDateZar: Number(membership.savings_to_date_zar ?? 0),
          discountPercent: membershipPct,
          plan: membership.membership_plans,
          currentPeriodEnd: membership.current_period_end,
        }
      : null,
    bundleSuggestions: bundles.map((b) => ({
      id: b.id,
      name: b.name,
      discountType: b.discount_type,
      discountValue: b.discount_value,
      requiredServiceSlugs: b.required_service_slugs,
      requiredExtraIds: b.required_extra_ids,
    })),
    expiringRewards,
    creditHistory: history,
    profile: {
      dateOfBirth: profile?.date_of_birth ?? null,
      tier: profile?.tier ?? "regular",
    },
  });
}
