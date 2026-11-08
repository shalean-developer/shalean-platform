import { expect, it, vi } from 'vitest';
vi.mock('@/lib/admin/payouts/officePayoutPeriodReport',()=>({
  normalizeOfficePayoutPeriodRange:()=>({from:'2026-11-01',to:'2026-11-30'}),
  loadOfficePayoutPeriodReport:async()=>({totals:{earned_cents:1000,paid_cents:0}}),
}));
vi.mock('@/lib/payments/loadSettlementCashSummary',()=>({loadSettlementCashSummary:async()=>({settled_to_bank_cents:0,in_transit_cents:75000,unverified_pending_cents:0})}));
import { loadCashSurvivalDashboard } from '../loadCashSurvivalDashboard';
it('a freshly saved local bank balance and provider references cannot authorize spending or runway',async()=>{
  const now=new Date('2026-11-08T10:00:00Z');
  const admin={from:(table:string)=>{
    const result={data:table==='expense_accounts'?[{id:'local',name:'Bank',account_type:'bank',balance_cents:10000000,updated_at:now.toISOString()}]:[],error:null};
    const query:Record<string,unknown>={then:(resolve:(r:typeof result)=>unknown)=>Promise.resolve(result).then(resolve)};
    for(const method of ['select','eq','gte','lte']) query[method]=()=>query;
    return query;
  }};
  const result=await loadCashSurvivalDashboard(admin as never,undefined,undefined,now);
  expect(result.cash.bank_cents).toBe(10000000); expect(result.data_quality.bank_balance_fresh).toBe(true);
  expect(result.status).toBe('unknown'); expect(result.decision.safe_to_spend_cents).toBeNull();expect(result.decision.runway_days).toBeNull();
  expect(result.data_quality.note).toContain('customer advances');
});
