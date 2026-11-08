import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({loading:false,error:null as string|null,from:'2026-11-01',to:'2026-11-30'}));
vi.mock('@/lib/admin/payouts/officePayoutPeriodReport',()=>({defaultOfficePayoutPeriodRange:()=>({from:'2026-11-01',to:'2026-11-30'})}));
vi.mock('@/hooks/useAdminData',()=>({useAdminData:(endpoint:string)=>({
  loading:state.loading,error:state.error,refetch:()=>{},data:endpoint.endsWith('cash-flow')?{
    period:{from:state.from,to:state.to},summary:{money_received_net_cents:987654,money_paid_cents:987654,cash_in_bank_cents:987654,petty_cash_cents:987654,net_cash_flow_cents:987654},
    payment_evidence:{verified_transaction_count:0,fees_verified:false},daily_position:[],monthly_position:[],
  }:endpoint.endsWith('cash-survival')?{period:{from:state.from,to:state.to},obligations:{cleaner_unpaid_liability_cents:987654,minimum_operating_reserve_cents:987654},receivables:{sent_collectible_cents:987654,draft_monthly_cents:987654}}:null,
})}));
import CashFlowPage from '@/app/(ui-redesign)/office/cash-flow/page';
afterEach(()=>Object.assign(state,{loading:false,error:null,from:'2026-11-01',to:'2026-11-30'}));
it.each(['error','loading','previousPeriod'])('never displays retained previous amounts during %s',kind=>{
  if(kind==='error') state.error='offline';if(kind==='loading') state.loading=true;if(kind==='previousPeriod')state.from='2026-10-01';
  const html=renderToStaticMarkup(React.createElement(CashFlowPage));expect(html).not.toContain('9\u00a0876');expect(html).toContain('Unavailable');
  expect(html).not.toContain('Live data');
});
it('explains genuine empty charts and labels date inputs',()=>{
  const html=renderToStaticMarkup(React.createElement(CashFlowPage));
  expect(html).toContain('No recorded daily cash-flow entries in this period.');expect(html).toContain('No recorded inflows or provisional outflows in this period.');
  expect(html).toContain('aria-label="From date"');expect(html).toContain('aria-label="To date"');
});
