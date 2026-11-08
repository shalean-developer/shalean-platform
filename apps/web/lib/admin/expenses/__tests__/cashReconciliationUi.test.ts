import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { CashReconciliationPanel } from '@/components/admin/finance/CashReconciliationPanel';
import { syntheticCashReconciliation } from '../cashReconciliation';
import { summarizeCashReconciliation } from '../cashReconciliation';
it('labels available or unknown feeds without rendering an accounting difference',()=>{
  const now = new Date('2026-11-08T10:00:00Z');
  for (const basis of ['available','unknown'] as const) {
    const rows = [1,2,3,4].map(n=>({id:String(n),name:`Bank ${n}`,bankCents:12666,bookCents:579584,bankBalanceBasis:basis,identityVerified:true,bookReadAt:now.toISOString(),feedAt:now.toISOString()}));
    const data = summarizeCashReconciliation(rows,rows.map(r=>r.id),now);
    const html = renderToStaticMarkup(React.createElement(CashReconciliationPanel,{data,loading:false}));
    expect(html).toContain('Not comparable');
    expect(html).toContain('Current bank balance needed for comparison.');
    expect(html).toContain(basis==='available'?'Available':'Unconfirmed');
    expect(html).not.toContain('5 669'); expect(html).not.toContain('5,669');
    expect(html).toContain('Safe to spend<strong class="block">Unavailable');
  }
});
it('renders fictional differences and obligations without presenting a spending recommendation',()=>{
  const data=syntheticCashReconciliation('differences',new Date('2026-11-08T10:00:00Z'));
  const html=renderToStaticMarkup(React.createElement(CashReconciliationPanel, {data, loading:false}));
  expect(html).toContain('Demo balances — not real money.');expect(html).toContain('Difference');
  expect(html).toContain('Customer advances');expect(html).toContain('Funds held for Bokkie');
  expect(html).toContain('Safe to spend<strong class="block">Unavailable');expect(html).toContain('Cash runway<strong class="block">Unavailable');
});
it('does not render stale cached financial values during a refresh or failed request',()=>{
  const data=syntheticCashReconciliation('equal',new Date());
  for(const state of [{loading:true},{loading:false,error:'offline'}]) {
    const html=renderToStaticMarkup(React.createElement(CashReconciliationPanel, {data, ...state}));
    expect(html).not.toContain('synthetic-0');expect(html).not.toContain('R 7');expect(html).toContain('Unavailable');
  }
});


it('keeps account rows and obligations collapsed, with the spending warning visible',()=>{
  const html=renderToStaticMarkup(React.createElement(CashReconciliationPanel, {data:syntheticCashReconciliation('differences',new Date()),loading:false}));
  const visible=html.replace(/<details[\s\S]*?<\/details>/g,'');
  expect(visible).toContain('Demo balances — not real money.');
  expect(visible).toContain('Verify balances and obligations before spending.');
  expect(visible).toContain('Safe to spend');expect(visible).not.toContain('<table');
  expect(visible).not.toContain('Paystack Clearing');expect(html).not.toContain('<details open');
});

it.each(['equal','stale','missing'])('preserves unavailable spending and source guards for %s',scenario=>{
  const html=renderToStaticMarkup(React.createElement(CashReconciliationPanel, {data:syntheticCashReconciliation(scenario,new Date()),loading:false}));
  expect(html).toContain('Safe to spend<strong class="block">Unavailable');
  if(scenario!=='equal') expect(html).toContain('Bank feed total unavailable: missing or stale balances.');
  else expect(html).toContain('Equal · unverified');
});

it.each(['stale','missing'])('renders independent book totals and observation times with %s bank evidence',scenario=>{
  const data=syntheticCashReconciliation(scenario,new Date('2026-11-08T10:00:00Z'));
  const html=renderToStaticMarkup(React.createElement(CashReconciliationPanel,{data,loading:false}));
  expect(data.bookCents).toBe(1000000);expect(data.bankCents).toBeNull();
  expect(html).toContain('Zoho book total');
  expect(html).not.toContain('Zoho book total unavailable');
  expect(html).toContain('Books read:');expect(html).toContain('Feed refreshed:');
  expect(html).toContain('Book balances are accounting records, not verified bank cash or spendable funds.');
});


