import { expect, it } from 'vitest';
import { perCleanerAllocationsForBooking } from '@/lib/admin/payouts/officePayoutPeriodReport';
import { fixturePlan, ids } from '../../../../../scripts/audits/paired-ui-fixture.mjs';

it('renders the actual paired UI fixture as R250 per cleaner, R500 aggregate', () => {
  const fixture = fixturePlan(new Date('2026-10-15T12:00:00Z'));
  const allocations = perCleanerAllocationsForBooking(
    { ...fixture, payout_frozen_cents: null },
    [{ cleaner_id: ids.lead, role: 'lead' }, { cleaner_id: ids.member, role: 'member' }],
  );
  expect(allocations.map(row => [row.cleaner_id, row.cents])).toEqual([[ids.lead, 25000], [ids.member, 25000]]);
  expect(allocations.reduce((total, row) => total + row.cents, 0)).toBe(fixture.cleaner_earnings_total_cents);
});
