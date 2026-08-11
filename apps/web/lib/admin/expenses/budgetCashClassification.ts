export type BudgetCashClass = "protected" | "variable" | "booking_linked" | "discretionary" | "reserve";

export type BudgetCashPolicy = {
  cashClass: BudgetCashClass;
  requiresSafeToSpend: boolean;
  description: string;
};

const NORMALIZE = /[^a-z0-9]+/g;

function key(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase().replace(NORMALIZE, " ").trim();
}

/** Cash-control classification is deliberately separate from accounting categories.
 * A budget is permission to plan, not permission to spend cash that is reserved for cleaners
 * or critical operations.
 */
export function classifyBudgetCashPolicy(label: string | null | undefined): BudgetCashPolicy {
  const k = key(label);

  if (/cleaner|payout/.test(k)) {
    return { cashClass: "protected", requiresSafeToSpend: false, description: "Protected cleaner liability; fund before discretionary spend." };
  }
  if (/insurance|hosting|zoho|communication|bank charge/.test(k)) {
    return { cashClass: "protected", requiresSafeToSpend: false, description: "Critical operating overhead; keep current where due." };
  }
  if (/fuel|cleaning suppl|uber|transport|vehicle/.test(k)) {
    return { cashClass: "booking_linked", requiresSafeToSpend: false, description: "Spend only where required to deliver confirmed revenue-producing work." };
  }
  if (/paystack|payment fee|gateway/.test(k)) {
    return { cashClass: "variable", requiresSafeToSpend: false, description: "Variable with collected customer payments; forecast from actual effective fee rate." };
  }
  if (/owner|marketing|advert|other|ai tool|software/.test(k)) {
    return { cashClass: "discretionary", requiresSafeToSpend: true, description: "Allowed only after cleaner reserve, critical bills and minimum cash reserve are protected." };
  }
  if (/reserve|emergency|contingency/.test(k)) {
    return { cashClass: "reserve", requiresSafeToSpend: false, description: "Cash reserve; not normal operating spending authority." };
  }
  return { cashClass: "variable", requiresSafeToSpend: true, description: "Review against Safe to Spend before committing cash." };
}

export function canSpendDiscretionary(opts: {
  requestedCents: number;
  safeToSpendCents: number;
  bankBalanceFresh: boolean;
}): { allowed: boolean; reason: string | null } {
  if (!opts.bankBalanceFresh) return { allowed: false, reason: "Refresh the bank balance before discretionary spending." };
  if (opts.requestedCents <= 0) return { allowed: false, reason: "Spending amount must be greater than zero." };
  if (opts.requestedCents > opts.safeToSpendCents) {
    return { allowed: false, reason: `Requested spend exceeds Safe to Spend by ${opts.requestedCents - opts.safeToSpendCents} cents.` };
  }
  return { allowed: true, reason: null };
}
