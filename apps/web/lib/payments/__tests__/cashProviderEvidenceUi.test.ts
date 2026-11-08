import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {CashProviderEvidenceDetails} from '@/components/admin/finance/CashProviderEvidenceDetails';
import {syntheticProviderEvidence} from '../cashProviderEvidence';
it('discloses source time, all-date pending basis and matched-bank subset without claiming spendable cash',()=>{
  const data=syntheticProviderEvidence('2026-11-01','2026-11-30',new Date('2026-11-08T12:00:00Z'));
  const html=renderToStaticMarkup(React.createElement(CashProviderEvidenceDetails,{data}));
  expect(html).toContain('2026-11-08T12:00:00.000Z');expect(html).toContain('Pending amounts are not restricted');expect(html).toContain('No provider amount is added');
  expect(html).toContain('demo-bank-line');expect(html).not.toContain('<details open');
});
it('hides retained provider values when the parent has no current-period evidence',()=>{
  const html=renderToStaticMarkup(React.createElement(CashProviderEvidenceDetails,{data:null}));
  expect(html).toContain('Previous-period figures are hidden');expect(html).not.toContain('demo-bank-line');
});
