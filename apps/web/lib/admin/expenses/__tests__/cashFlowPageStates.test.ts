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
  expect(html).toContain('No recorded activity.');expect(html).toContain('No recorded activity.');
  expect(html).toContain('aria-label="From date"');expect(html).toContain('aria-label="To date"');
});

it('keeps secondary balances and payment rules available in native collapsed disclosures',()=>{
  const html=renderToStaticMarkup(React.createElement(CashFlowPage));
  expect(html).toContain('Balances &amp; obligations');
  expect(html).toContain('How totals are calculated');
  expect(html).toContain('Approved expenses may not yet be paid.');
  expect(html).toContain('<details');expect(html).not.toContain('<details open');
});


it('keeps charts and long explanations out of the default overview',()=>{
  const html=renderToStaticMarkup(React.createElement(CashFlowPage));
  const visible=html.replace(/<details[\s\S]*?<\/details>/g,'');
  expect(html).toContain('Activity charts');expect(visible).not.toContain('No recorded activity.');
  expect(visible).toContain('Payouts + approved expenses');
  expect(visible).not.toContain('Payment evidence');expect(visible).not.toContain('Provisional net uses');
});

it('shows forecast totals while keeping exclusions and source records collapsed',async()=>{
  const {CashFlowForecastBreakdown}=await import('@/components/admin/finance/CashFlowForecastBreakdown');
  const html=renderToStaticMarkup(React.createElement(CashFlowForecastBreakdown,{from:'2026-11-01',to:'2026-11-30',forecast:{income_cents:123400,expenses_cents:567800,earlier_income_cents:0,earlier_expenses_cents:0,undated_income_cents:0,undated_expenses_cents:0,issues:['Source needs review'],items:[]}}));
  const visible=html.replace(/<details[\s\S]*<\/details>/g,'');
  expect(visible).toContain('Expected in');expect(visible).toContain('Expected out');
  expect(visible).toContain('Partial estimate');expect(visible).toContain('Source needs review');
  expect(visible).not.toContain('Earlier unpaid');expect(html).not.toContain('<details open');
});
