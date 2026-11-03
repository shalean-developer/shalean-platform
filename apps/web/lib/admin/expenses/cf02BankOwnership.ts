/**
 * CF-02: read-only aggregation of independently verified Zoho bank-feed snapshots.
 *
 * This module never allocates money to Shalean by account name. A separate,
 * reconciled intercompany ledger must establish beneficial ownership before
 * any cash may be marked spendable.
 */
export type Cf02BankSnapshot = {
  zohoAccountId: string;
  accountName: string;
  bankBalanceCents: number;
  feedRefreshedAt: string | null;
  currency: string;
  accountType: "bank" | "other";
  active: boolean;
  ownershipReconciled: boolean;
};

export type Cf02BankSummary = {
  totalBankHeldCents: number | null;
  shaleanOwnedCents: null;
  bokkieHeldCents: null;
  safeToSpendCents: null;
  accountCount: number;
  bankBalancesVerified: boolean;
  ownershipReady: false;
  problems: string[];
};

export function summarizeCf02BankSnapshots(
  accounts: readonly Cf02BankSnapshot[],
  expectedIds: readonly string[],
  now: Date,
  maxFeedAgeHours = 48,
): Cf02BankSummary {
  const problems: string[] = [];
  if (expectedIds.length !== 4 || new Set(expectedIds).size !== 4 || expectedIds.some(id => !/^\d+$/.test(id))) {
    problems.push("Exactly four distinct verified Zoho bank account IDs are required.");
  }
  const seen = new Set<string>();
  let total = 0;
  for (const account of accounts) {
    if (!account.zohoAccountId || seen.has(account.zohoAccountId)) {
      problems.push("Duplicate or missing Zoho bank account ID.");
    }
    seen.add(account.zohoAccountId);
    if (!expectedIds.includes(account.zohoAccountId)) problems.push("Unexpected Zoho account.");
    if (!account.active || account.accountType !== "bank" || account.currency !== "ZAR") {
      problems.push("Inactive, non-bank or non-ZAR account.");
    }
    if (!Number.isSafeInteger(account.bankBalanceCents)) problems.push("Invalid account balance.");
    else total += account.bankBalanceCents;
    const feedMs = account.feedRefreshedAt ? Date.parse(account.feedRefreshedAt) : NaN;
    if (!Number.isFinite(feedMs) || feedMs > now.getTime() ||
      now.getTime() - feedMs > maxFeedAgeHours * 3_600_000) {
      problems.push("Missing, future or stale bank feed.");
    }
  }
  if (seen.size !== 4 || expectedIds.some(id => !seen.has(id))) {
    problems.push("Four mapped bank accounts are not all present.");
  }
  if (!accounts.every(a => a.ownershipReconciled)) {
    problems.push("Business ownership allocation is not reconciled.");
  }
  // A complete bank-physical-cash picture does not establish beneficial
  // ownership or discretion to spend; always keep those fields unavailable.
  return {
    totalBankHeldCents: problems.some(p => p !== "Business ownership allocation is not reconciled.") ? null : total,
    shaleanOwnedCents: null,
    bokkieHeldCents: null,
    safeToSpendCents: null,
    accountCount: accounts.length,
    bankBalancesVerified: !problems.some(p => p !== "Business ownership allocation is not reconciled."),
    ownershipReady: false,
    problems: [...new Set(problems)],
  };
}
