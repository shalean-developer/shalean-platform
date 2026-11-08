/** Read-only cash evidence. Equal balances do not prove ownership or statement reconciliation. */
export const CASH_ACCOUNT_MAPPING = [
  { id: '253016000000097002', name: 'Income Account' },
  { id: '253016000000097015', name: 'Expense Account' },
  { id: '253016000000097007', name: 'Shalean Account' },
  { id: '253016000000097011', name: 'Bokkie Account' },
] as const;
export type BankEvidence = {
  id: string; name: string; bankCents: number | null; bookCents: number | null;
  feedAt: string | null; identityVerified: boolean;
};
export type CashReconciliation = ReturnType<typeof summarizeCashReconciliation>;
export function summarizeCashReconciliation(rows: BankEvidence[], expectedIds: readonly string[], now: Date, synthetic = false) {
  const accounts = rows.map(row => {
    const time = row.feedAt ? Date.parse(row.feedAt) : NaN;
    const fresh = Number.isFinite(time) && time <= now.getTime() && now.getTime() - time <= 48 * 3600000;
    const validMoney = (v: number | null): v is number => v !== null && Number.isSafeInteger(v);
    const valid = row.identityVerified && fresh && validMoney(row.bankCents) && validMoney(row.bookCents);
    const differenceCents = validMoney(row.bankCents) && validMoney(row.bookCents) ? row.bookCents - row.bankCents : null;
    return { ...row, fresh, valid, differenceCents };
  });
  const ids = accounts.map(a => a.id);
  const complete = expectedIds.length === 4 && new Set(expectedIds).size === 4 && ids.length === 4 && new Set(ids).size === 4 &&
    expectedIds.every(id => ids.includes(id)) && accounts.every(a => a.valid);
  const sum = (field: 'bankCents' | 'bookCents') => {
    const value = accounts.reduce((n, a) => n + (a[field] ?? 0), 0);
    return complete && Number.isSafeInteger(value) ? value : null;
  };
  const bankCents = sum('bankCents');
  const bookCents = sum('bookCents');
  return {
    asOf: now.toISOString(), synthetic, accounts, complete, bankCents, bookCents,
    differenceCents: bankCents !== null && bookCents !== null ? bookCents - bankCents : null,
    // No verified transaction-level ownership/advance evidence is currently integrated.
    // Neither a recent local save nor matching bank/book balances may override this gate.
    safeToSpendCents: null, runwayDays: null, bokkieObligationCents: null, customerAdvancesCents: null,
    ownershipVerified: false,
    processorLedgerCents: null as number | null, undepositedLedgerCents: null as number | null,
  };
}
export function syntheticCashReconciliation(scenario: string, now: Date) {
  const rows: BankEvidence[] = ['Income Account', 'Expense Account', 'Shalean Account', 'Bokkie Account'].map((name, i) => ({
    id: `synthetic-${i}`, name: `Synthetic ${name}`, bankCents: (i + 1) * 100000,
    bookCents: (i + 1) * 100000, feedAt: now.toISOString(), identityVerified: true,
  }));
  if (scenario === 'differences') { rows[0].bookCents! += 2500; rows[1].bookCents! += 10000; }
  if (scenario === 'stale') rows[0].feedAt = new Date(now.getTime() - 49 * 3600000).toISOString();
  if (scenario === 'missing') rows[1].bankCents = null;
  return { ...summarizeCashReconciliation(rows, rows.map(r => r.id), now, true), processorLedgerCents: 75000, undepositedLedgerCents: scenario === 'differences' ? -1500 : 0 };
}
