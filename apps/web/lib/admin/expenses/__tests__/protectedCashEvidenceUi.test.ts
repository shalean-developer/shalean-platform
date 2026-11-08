import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ProtectedCashEvidenceDetails } from '@/components/admin/finance/ProtectedCashEvidenceDetails';
import { syntheticProtectedCashEvidence } from '../protectedCashEvidence';
it('shows source identities/timestamps with signed-book, overlap and incomplete-payable disclosures', () => {
  const html = renderToStaticMarkup(React.createElement(ProtectedCashEvidenceDetails, { data: syntheticProtectedCashEvidence(new Date('2026-11-08T12:00:00Z')) }));
  for (const text of ['253016000000482529', '253016000000005001', '2026-11-08T12:00:00.000Z', 'signed closing balances', 'older unpaid cleaner earnings', 'overlapping obligations twice', 'Protected total: Unavailable']) expect(html).toContain(text);
  expect(html).not.toContain('<details open');
});
it('hides previous observations when loading/error makes current evidence unavailable', () => {
  const html = renderToStaticMarkup(React.createElement(ProtectedCashEvidenceDetails, { data: null }));
  expect(html).toContain('Previous values are hidden'); expect(html).not.toContain('253016000000482529');
});
