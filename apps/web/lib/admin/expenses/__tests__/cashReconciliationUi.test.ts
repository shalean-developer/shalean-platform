import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { CashReconciliationPanel } from '@/components/admin/finance/CashReconciliationPanel';
import { syntheticCashReconciliation } from '../cashReconciliation';
it('renders fictional differences and obligations without presenting a spending recommendation',()=>{
  const data=syntheticCashReconciliation('differences',new Date('2026-11-08T10:00:00Z'));
  const html=renderToStaticMarkup(React.createElement(CashReconciliationPanel, {data, loading:false}));
  expect(html).toContain('every amount in this section is fictional');expect(html).toContain('Unresolved difference');
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
