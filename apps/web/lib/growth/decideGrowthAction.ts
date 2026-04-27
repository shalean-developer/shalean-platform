import "server-only";

import type { CustomerRetentionState } from "@/lib/growth/customerRetention";
import type { CustomerLtvResult } from "@/lib/growth/customerLTV";
import type { CustomerMarketingSegment } from "@/lib/growth/customerSegment";

export type GrowthAction = "offer_discount" | "upsell" | "do_nothing";
/** Growth never uses WhatsApp; SMS only when there is no email or as send-time fallback after email fails. */
export type GrowthChannel = "email" | "sms";

export type DecideGrowthActionInput = {
  segment: CustomerMarketingSegment;
  ltv: CustomerLtvResult;
  retention: CustomerRetentionState;
  /** When false, skip discount-heavy actions (over-discount guard). */
  discountBudgetOk?: boolean;
  /** When omitted, treated as true (legacy callers / post-booking hint). */
  hasEmail?: boolean;
  /** Must be true to allow SMS-primary rule paths (no email on file). */
  hasPhone?: boolean;
};

export type DecideGrowthActionResult = {
  action: GrowthAction;
  channel: GrowthChannel;
  reason: string;
};

/**
 * Combines segment, LTV, and retention for a single outbound decision.
 * Channel policy: **email first**; `channel: "sms"` only when there is no email but a phone exists.
 * Cooldown / send orchestration lives in callers (cron, post-booking hooks).
 */
export function decideGrowthAction(customer: DecideGrowthActionInput): DecideGrowthActionResult {
  const discountOk = customer.discountBudgetOk !== false;
  const hasEmail = customer.hasEmail !== false;
  const hasPhone = customer.hasPhone === true;

  if (!hasEmail && !hasPhone) {
    return { action: "do_nothing", channel: "email", reason: "no_contact" };
  }

  if (customer.retention === "churned") {
    if (!hasEmail && hasPhone) {
      return {
        action: discountOk ? "offer_discount" : "do_nothing",
        channel: "sms",
        reason: discountOk ? "churned_win_back_sms_only" : "churned_win_back_sms_budget_hold",
      };
    }
    return {
      action: discountOk ? "offer_discount" : "do_nothing",
      channel: "email",
      reason: "churned_win_back",
    };
  }

  const smsOnly = !hasEmail && hasPhone;

  if (customer.retention === "at_risk") {
    return {
      action: customer.segment === "loyal" ? "upsell" : "offer_discount",
      channel: smsOnly ? "sms" : "email",
      reason: smsOnly ? "at_risk_re_engagement_sms_only" : "at_risk_re_engagement",
    };
  }

  if (customer.ltv.ltv_score === "high" || customer.segment === "loyal") {
    return { action: "upsell", channel: smsOnly ? "sms" : "email", reason: "high_ltv_or_loyal" };
  }

  if (customer.ltv.ltv_score === "low" && discountOk) {
    return { action: "offer_discount", channel: smsOnly ? "sms" : "email", reason: "low_ltv_acquisition" };
  }

  if (customer.ltv.ltv_score === "medium") {
    return { action: "upsell", channel: smsOnly ? "sms" : "email", reason: "medium_ltv_recurring_pitch" };
  }

  return { action: "do_nothing", channel: "email", reason: "no_action" };
}
