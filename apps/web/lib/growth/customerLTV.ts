import "server-only";

export type LtvScoreBand = "low" | "medium" | "high";

export type CustomerLtvInput = {
  totalSpentCents: number;
  bookingCount: number;
  /** True when user has an active recurring subscription row (caller resolves). */
  hasActiveSubscription: boolean;
};

export type CustomerLtvResult = {
  ltv_score: LtvScoreBand;
  recommended_action: "discount_offer" | "encourage_recurring" | "upsell_premium";
};

function spendZar(cents: number): number {
  return Math.max(0, cents) / 100;
}

/**
 * Heuristic LTV tiering for growth actions (does not change pricing engine).
 */
export function calculateCustomerLTV(customer: CustomerLtvInput): CustomerLtvResult {
  const zar = spendZar(customer.totalSpentCents);
  const freq = Math.max(0, Math.floor(customer.bookingCount));

  if (customer.hasActiveSubscription && zar >= 800) {
    return { ltv_score: "high", recommended_action: "upsell_premium" };
  }
  if (zar >= 2500 || freq >= 8) {
    return { ltv_score: "high", recommended_action: "upsell_premium" };
  }
  if (zar >= 800 || freq >= 3) {
    return { ltv_score: "medium", recommended_action: "encourage_recurring" };
  }
  return { ltv_score: "low", recommended_action: "discount_offer" };
}
