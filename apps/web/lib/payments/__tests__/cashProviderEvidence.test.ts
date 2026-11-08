import { describe,expect,it } from 'vitest';
import { cashPeriodBounds, summarizeProviderEvidence, validCashPeriod, PAYSTACK_DESTINATION_ACCOUNT_ID as accountId, type ProviderReceipt, type ProviderPayout, type ImportedDeposit } from '../cashProviderEvidence';
const now=new Date('2026-11-08T12:00:00Z');
const receipt:ProviderReceipt={id:'charge',reference:'charge-reference',paidAt:'2026-10-31T22:00:00.000Z',amountCents:10000,feeCents:300};
const payout:ProviderPayout={id:'123',date:'2026-10-31',status:'success',amountCents:9700};
const deposit:ImportedDeposit={id:'bank-line',payoutReference:'123',date:'2026-11-01',amountCents:9700,accountId};
const summarize=(r=[receipt],p=[payout],d:ImportedDeposit[]|null=[deposit])=>summarizeProviderEvidence(r,p,d,'2026-11-01','2026-11-30',now);
describe('direct provider observations and imported bank links',()=>{
  it('uses Johannesburg paid dates and bank dates independently from payout dates',()=>{
    const s=summarize();expect(s.receipts.grossCents).toBe(10000);expect(s.receipts.feeCents).toBe(300);
    expect(s.payouts.paidCents).toBe(0);expect(s.bank.matchedCents).toBe(9700);
    expect(s.bank.matches[0]).toMatchObject({payoutId:'123',depositId:'bank-line',bankDate:'2026-11-01'});
  });
  it('preserves subsecond exclusive-end boundaries',()=>{
    const s=summarize([{...receipt,paidAt:'2026-11-30T21:59:59.999Z'},{...receipt,id:'end',reference:'end',paidAt:'2026-11-30T22:00:00.000Z'}]);expect(s.receipts.count).toBe(1);
    expect(cashPeriodBounds('2026-11-01','2026-11-30').start).toBe(Date.parse('2026-10-31T22:00:00Z'));
  });
  it('counts undated/current pending and processing payouts outside the selected period without counting failures',()=>{
    const s=summarize([], [{...payout,id:'1',date:null,status:'pending'},{...payout,id:'2',date:'2026-12-01',status:'processing'},{...payout,id:'3',date:null,status:'failed'}]);
    expect(s.payouts.pendingCents).toBe(19400);expect(s.payouts.pendingCount).toBe(2);expect(s.payouts.paidCents).toBe(0);expect(s.bank.matchedCents).toBe(0);
  });
  it('keeps actual gross available but does not invent missing fees',()=>{
    expect(summarize([{...receipt,feeCents:null}]).receipts).toMatchObject({grossCents:10000,feeCents:null});
  });
  it('keeps provider values when bank evidence is unavailable',()=>{
    const s=summarize([receipt],[{...payout,date:'2026-11-01'}],null);
    expect(s.receipts.grossCents).toBe(10000);expect(s.payouts.paidCents).toBe(9700);expect(s.bank.matchedCents).toBeNull();expect(s.bank.unmatchedPaidCount).toBeNull();
  });
  it.each(['reference','amount','account','ambiguous','pending'] as const)('does not certify a bank match from %s evidence',kind=>{
    const d=[{...deposit}];let p={...payout,date:'2026-11-01'};
    if(kind==='reference')d[0].payoutReference='other';if(kind==='amount')d[0].amountCents=10000;
    if(kind==='account')d[0].accountId='other';if(kind==='ambiguous')d.push({...deposit,id:'another'});
    if(kind==='pending')p={...p,status:'pending'};
    expect(summarize([], [p], d).bank.matchedCents).toBe(0);
  });
  it('rejects duplicate provider or imported-bank identities rather than double-counting',()=>{
    expect(()=>summarize([receipt,receipt])).toThrow('Duplicate');expect(()=>summarize([],[payout,payout])).toThrow('Duplicate');
    expect(()=>summarize([],[payout],[deposit,deposit])).toThrow('Duplicate');
  });
  it.each([['2026-02-31','2026-03-01'],['2026-11-02','2026-11-01'],['2025-01-01','2026-11-01']])('rejects invalid or unbounded periods %s to %s',(from,to)=>expect(validCashPeriod(from,to)).toBe(false));
});
