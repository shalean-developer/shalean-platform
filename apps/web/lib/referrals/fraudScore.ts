import "server-only";

export type ReferralFraudSignal = {
  code: string;
  label: string;
  weight: number;
};

export type ReferralFraudScoreInput = {
  spikeSuspected?: boolean;
  currentMonthRedemptions?: number;
  avgPrior3MonthsRedemptions?: number;
  rewardToGrossRevenueRatio?: number | null;
  repeatRefereeExcessRatio?: number | null;
  estimatedNetContributionZar?: number | null;
  duplicateFingerprintIdentities?: number;
  monthlyRewardCapHit?: boolean;
};

export type ReferralFraudScoreResult = {
  score: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  signals: ReferralFraudSignal[];
};

export function computeReferralFraudScore(input: ReferralFraudScoreInput): ReferralFraudScoreResult {
  const signals: ReferralFraudSignal[] = [];
  let score = 0;

  if (input.spikeSuspected) {
    signals.push({ code: "redemption_spike", label: "Redemption spike vs prior months", weight: 35 });
    score += 35;
  }

  if ((input.duplicateFingerprintIdentities ?? 0) > 1) {
    signals.push({
      code: "duplicate_fingerprint",
      label: "Same device used for multiple identities",
      weight: 40,
    });
    score += 40;
  }

  if (input.rewardToGrossRevenueRatio != null && input.rewardToGrossRevenueRatio > 0.5) {
    signals.push({ code: "high_reward_ratio", label: "Rewards exceed 50% of referred revenue", weight: 25 });
    score += 25;
  }

  if (input.repeatRefereeExcessRatio != null && input.repeatRefereeExcessRatio > 0.25) {
    signals.push({ code: "repeat_referee", label: "Unusual repeat referee pattern", weight: 20 });
    score += 20;
  }

  if (input.estimatedNetContributionZar != null && input.estimatedNetContributionZar < 0) {
    signals.push({ code: "negative_contribution", label: "Negative net referral contribution", weight: 15 });
    score += 15;
  }

  if (input.monthlyRewardCapHit) {
    signals.push({ code: "monthly_cap", label: "Hit monthly referrer reward cap", weight: 20 });
    score += 20;
  }

  const current = input.currentMonthRedemptions ?? 0;
  const avg = input.avgPrior3MonthsRedemptions ?? 0;
  if (current >= 10 && avg > 0 && current >= avg * 2) {
    signals.push({ code: "elevated_redemptions", label: "Elevated redemption volume", weight: 15 });
    score += 15;
  }

  score = Math.min(100, score);

  let riskLevel: ReferralFraudScoreResult["riskLevel"] = "low";
  if (score >= 70) riskLevel = "critical";
  else if (score >= 45) riskLevel = "high";
  else if (score >= 25) riskLevel = "medium";

  return { score, riskLevel, signals };
}
