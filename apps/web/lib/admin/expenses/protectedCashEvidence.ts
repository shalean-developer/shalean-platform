/** Current book observations, never certification of cash ownership or payable completeness. */
export const PROTECTED_BOOK_ACCOUNTS = [
  { id: '253016000000482529', name: 'Funds held for Bokkie' },
  { id: '253016000000005001', name: 'Customer advances' },
] as const;
export type ProtectedCashEvidence = {
  synthetic: boolean;
  accounts: Array<{ id: string; name: string; balanceCents: number | null; readAt: string | null }>;
  reconciled: false;
  protectedTotalCents: null;
  spendableCents: null;
  runwayDays: null;
};
export function emptyProtectedCashEvidence(synthetic = false): ProtectedCashEvidence {
  return { synthetic, accounts: PROTECTED_BOOK_ACCOUNTS.map(a => ({ ...a, balanceCents: null, readAt: null })), reconciled: false, protectedTotalCents: null, spendableCents: null, runwayDays: null };
}
export function syntheticProtectedCashEvidence(now = new Date()): ProtectedCashEvidence {
  const result = emptyProtectedCashEvidence(true);
  result.accounts = result.accounts.map((a, i) => ({ ...a, balanceCents: (i + 1) * 10000, readAt: now.toISOString() }));
  return result;
}
