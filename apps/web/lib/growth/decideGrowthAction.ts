import "server-only";

import type { CustomerRetentionState } from "@/lib/growth/customerRetention";
import type { CustomerLtvResult } from "@/lib/growth/customerLTV";
import type { CustomerMarketingSegment } from "@/lib/growth/customerSegment";

export type GrowthAction = "offer_discount" | "upsell" | "do_nothing";
export type GrowthChannel = "whatsapp" | "email";

export type DecideGrowthActionInput = {
  segment: CustomerMarketingSegment;
  ltv: CustomerLtvResult;
  retention: CustomerRetentionState;
  /** When false, skip discount-heavy actions (over-discount guard). */
  discountBudgetOk?: boolean;
};

export type DecideGrowthActionResult = {
  action: GrowthAction;
  channel: GrowthChannel;
  reason: string;
};

/**
 * Combines segment, LTV, and retention for a single outbound decision.
 * Cooldown / send orchestration lives in callers (cron, post-booking hooks).
 */
export function decideGrowthAction(customer: DecideGrowthActionInput): DecideGrowthActionResult {
  const discountOk = customer.discountBudgetOk !== false;

  if (customer.retention === "churned") {
    return {
      action: discountOk ? "offer_discount" : "do_nothing",
      channel: "email",
      reason: "churned_win_back",
    };
  }

  if (customer.retention === "at_risk") {
    return {
      action: customer.segment === "loyal" ? "upsell" : "offer_discount",
      channel: "whatsapp",
      reason: "at_risk_re_engagement",
    };
  }

  if (customer.ltv.ltv_score === "high" || customer.segment === "loyal") {
    return { action: "upsell", channel: "email", reason: "high_ltv_or_loyal" };
  }

  if (customer.ltv.ltv_score === "low" && discountOk) {
    return { action: "offer_discount", channel: "email", reason: "low_ltv_acquisition" };
  }

  if (customer.ltv.ltv_score === "medium") {
    return { action: "upsell", channel: "email", reason: "medium_ltv_recurring_pitch" };
  }

  return { action: "do_nothing", channel: "email", reason: "no_action" };
}
