export type AdminReferralRow = {
  id: string;
  referrer: {
    id: string;
    type: "customer" | "cleaner";
    displayLabel: string;
    displayName: string | null;
    referralCode: string | null;
    emailOrPhone: string | null;
  };
  referred: {
    userId: string | null;
    emailOrPhone: string | null;
  };
  lifecycle: {
    status: string;
    rewardAmount: number;
    createdAt: string;
    completedAt: string | null;
    rewardedAt: string | null;
    codeSnapshot: string | null;
  };
  analytics: {
    totalCheckoutDiscountsZar: number;
    redemptionCount: number;
    attributedBookings: number;
    cleanerCheckoutAttributionCount: number;
    /** From `referral_reward_credited` (per referrer, rolled up in DB view). */
    rewardsCreditedCount: number;
    totalRewardsZar: number;
    avgRewardZar: number | null;
    latestRewardAt: string | null;
    customerRewardCount: number;
    cleanerRewardCount: number;
    /** From `referral_conversion_completed` (per referrer). */
    conversionsCompleted: number;
    distinctRefereeCount: number;
    latestConversionAt: string | null;
    customerConversionCount: number;
    cleanerConversionCount: number;
    /**
     * Attribution-based economics from `admin_referrer_profitability_rollups`
     * (paid bookings with `checkout_discount_applied` − discounts − rewards).
     * Not full profit — excludes ops cost, refunds, cleaner job payouts, etc.
     */
    profitability: {
      grossReferredRevenueZar: number;
      totalDiscountCostZar: number;
      totalRewardCostZar: number;
      estimatedNetContributionZar: number;
      profitableBookingCount: number;
      avgBookingValueZar: number | null;
      latestProfitableBookingAt: string | null;
    };
  };
};
