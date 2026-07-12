/** Shapes from GET /api/account/rewards — display only; server owns credit math. */

export type RewardsCreditSummary = {
  balanceZar: number;
  totalEarnedZar: number;
  totalUsedZar: number;
  nextExpiryAt: string | null;
};

export type RewardsCreditHistoryRow = {
  id: string;
  amountZar: number;
  balanceAfterZar: number;
  type: string;
  note: string | null;
  createdAt: string;
  referralId?: string | null;
  bookingId?: string | null;
};

export type RewardsPromotion = {
  id: string;
  slug?: string;
  name: string;
  description?: string | null;
  type?: string;
  headline?: string | null;
  cta?: string | null;
  endsAt?: string | null;
  promoCode?: string | null;
  discountType?: string | null;
  discountValue?: number | null;
  landingPagePath?: string | null;
};

export type RewardsBirthday = {
  creditZar: number;
  expiresAt: string;
  daysLeft: number;
};

export type AccountRewardsResponse = {
  activePromotions?: RewardsPromotion[];
  seasonalOffers?: Array<{
    id: string;
    name: string;
    headline?: string | null;
    endsAt?: string | null;
    promoCode?: string | null;
  }>;
  referralCredits?: RewardsCreditSummary;
  birthdayReward?: RewardsBirthday | null;
  membership?: {
    status: string;
    savingsToDateZar: number;
    discountPercent: number;
    currentPeriodEnd: string | null;
    plan?: { name?: string; slug?: string } | null;
  } | null;
  expiringRewards?: Array<{
    type: string;
    label: string;
    amountZar: number;
    expiresAt: string;
  }>;
  creditHistory?: RewardsCreditHistoryRow[];
  profile?: { dateOfBirth?: string | null; tier?: string };
};

export type ReferralsMeResponse = {
  referralCode: string;
  totalEarned: number;
  referralsCount: number;
  creditBalance: number;
  creditUsed: number;
  nextExpiryAt: string | null;
  totalReferrals: number;
  pendingReferrals: number;
  successfulReferrals: number;
  referralHistory: Array<{
    id: string;
    status: string;
    rewardAmount: number;
    referredContact: string | null;
    createdAt: string;
    rewardedAt: string | null;
  }>;
};

export type ReferralSettingsResponse = {
  enabled: boolean;
  rewardAmountZar: number;
  checkoutDiscountZar: number;
  heroHeadline?: string;
  heroSubheading?: string;
  promotionalText?: string;
  termsAndConditions?: string;
};

export type CreditHistoryResponse = {
  transactions: RewardsCreditHistoryRow[];
};

export type CustomerReviewRow = {
  id: string;
  booking_id: string;
  user_id: string | null;
  cleaner_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  serviceName?: string;
  bookingDate?: string | null;
  cleanerName?: string | null;
};

export type CustomerReviewsListResponse = {
  ok?: boolean;
  reviews: CustomerReviewRow[];
};
