import { describe, expect, it } from 'vitest';
import { summarizeCashReconciliation, syntheticCashReconciliation, type BankEvidence } from '../cashReconciliation';
const now = new Date('2026-11-08T10:00:00Z');
const rows = (): BankEvidence[] => [1,2,3,4].map(n => ({ id: String(n), name: `Bank ${n}`, bankCents: n*10000, bookCents:n*10000, feedAt:now.toISOString(), identityVerified:true }));
const summarize = (r: BankEvidence[]) => summarizeCashReconciliation(r, ['1','2','3','4'], now);
describe('CF-02 four-account evidence', () => {
  it('aggregates each account once but never certifies ownership from balance equality', () => {
    const s = summarize(rows()); expect(s.bankCents).toBe(100000); expect(s.differenceCents).toBe(0);
    expect(s.safeToSpendCents).toBeNull(); expect(s.runwayDays).toBeNull(); expect(s.bokkieObligationCents).toBeNull(); expect(s.customerAdvancesCents).toBeNull();
  });
  it('keeps internal transfers neutral', () => {
    const r = rows(); r[0].bankCents! -= 500; r[1].bankCents! += 500;
    r[0].bookCents! -= 500; r[1].bookCents! += 500;
    expect(summarize(r).bankCents).toBe(100000); expect(summarize(r).differenceCents).toBe(0);
  });
  it('shows signed differences without netting them into spendable cash', () => {
    const r = rows(); r[0].bookCents! += 2500; r[1].bookCents! -= 1000;
    const s = summarize(r); expect(s.differenceCents).toBe(1500); expect(s.accounts[0].differenceCents).toBe(2500); expect(s.safeToSpendCents).toBeNull();
  });
  it.each(['missing','duplicate','stale','future','identity','invalid'] as const)('fails closed on %s evidence', kind => {
    const r = rows();
    if(kind==='missing') r.pop(); if(kind==='duplicate') r[1].id='1';
    if(kind==='stale') r[0].feedAt='2026-11-01'; if(kind==='future') r[0].feedAt='2026-11-09';
    if(kind==='identity') r[0].identityVerified=false; if(kind==='invalid') r[0].bankCents=NaN;
    expect(summarize(r).bankCents).toBeNull(); expect(summarize(r).safeToSpendCents).toBeNull();
  });
  it('preserves negative balances rather than clamping overdrafts to zero', () => {
    const r=rows(); r[0].bankCents=-500; r[0].bookCents=-500; expect(summarize(r).bankCents).toBe(89500);
  });
  it('never adds processor balances or pending settlements to bank cash', () => {
    const s=syntheticCashReconciliation('equal',now); expect(s.processorLedgerCents).toBe(75000); expect(s.bankCents).toBe(1000000); expect(s.safeToSpendCents).toBeNull();
  });
});
