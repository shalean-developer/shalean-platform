/**
 * Pure marketing-only eligibility policy. Unknown information fails closed.
 * Transactional sends must never call this function.
 */
export type MarketingEligibilityEvidence = {
  recipientValid: boolean;
  customerIdentityVerified: boolean;
  consent: "granted" | "denied" | "unknown" | "error";
  crmUnsubscribed: boolean | null;
  locallySuppressed: boolean | null;
  providerStateFresh: boolean;
  providerUnsubscribed: boolean | null;
  providerSuppressed: boolean | null;
};
export type MarketingEligibilityDecision =
  | { allowed: true }
  | { allowed: false; reason: string };
export function decideMarketingEligibility(e: MarketingEligibilityEvidence): MarketingEligibilityDecision {
  if (!e.recipientValid) return { allowed: false, reason: "invalid_recipient" };
  if (!e.customerIdentityVerified) return { allowed: false, reason: "unverified_customer" };
  if (e.consent !== "granted") return { allowed: false, reason: "no_affirmative_consent" };
  if (e.crmUnsubscribed === true || e.providerUnsubscribed === true)
    return { allowed: false, reason: "unsubscribed" };
  if (e.locallySuppressed === true || e.providerSuppressed === true)
    return { allowed: false, reason: "suppressed" };
  if (!e.providerStateFresh || [e.crmUnsubscribed, e.locallySuppressed,
    e.providerUnsubscribed, e.providerSuppressed].some(v => v === null))
    return { allowed: false, reason: "unverified_preferences" };
  return { allowed: true };
}
