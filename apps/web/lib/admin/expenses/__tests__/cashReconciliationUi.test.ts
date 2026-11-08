import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { CashReconciliationPanel } from '@/components/admin/finance/CashReconciliationPanel';
import { syntheticCashReconciliation } from '../cashReconciliation';
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
  if(scenario!=='equal') expect(html).toContain('Totals unavailable: missing or stale balances.');
  else expect(html).toContain('Equal · unverified');
});
