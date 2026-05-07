export type ReferralLeaderboardRow = {
  referrerType: "customer" | "cleaner";
  referrerId: string;
  displayLabel: string;
  estimatedNetContributionZar: number;
  grossReferredRevenueZar: number;
  conversionsCompleted: number;
  attributedBookings: number;
  conversionRate: number | null;
};

export type GlobalMonthlyEconomicsRow = {
  monthBucket: string;
  grossReferredRevenueZar: number;
  totalDiscountCostZar: number;
  totalRewardCostZar: number;
  estimatedNetContributionZar: number;
  profitableBookingCount: number;
};

export type RedemptionSpikeFlagRow = {
  referrerType: "customer" | "cleaner";
  referrerId: string;
  displayLabel: string;
  currentMonthRedemptions: number;
  avgPrior3MonthsRedemptions: number;
  spikeSuspected: boolean;
};

export type QualitySignalRow = {
  referrerType: "customer" | "cleaner";
  referrerId: string;
  displayLabel: string;
  repeatRefereeExcessRatio: number | null;
  rewardToGrossRevenueRatio: number | null;
  conversionToAttributedBookingRatio: number | null;
  grossReferredRevenueZar: number | null;
  estimatedNetContributionZar: number | null;
};

export type ReferralsDashboardExtras = {
  leaderboards: {
    topByEstimatedContribution: ReferralLeaderboardRow[];
    topCustomersByContribution: ReferralLeaderboardRow[];
    topCleanersByContribution: ReferralLeaderboardRow[];
    topByConversionRate: ReferralLeaderboardRow[];
    topByGrossRevenue: ReferralLeaderboardRow[];
  };
  monthlyEconomics: GlobalMonthlyEconomicsRow[];
  spikeFlags: RedemptionSpikeFlagRow[];
  qualityHighRewardBurden: QualitySignalRow[];
};
