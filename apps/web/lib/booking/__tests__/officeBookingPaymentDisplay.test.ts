import { describe, expect, it } from 'vitest';
import { officeBookingCollectedCents, officeBookingPaymentDisplay } from '../officeBookingPaymentDisplay';
describe('Office collected payment display', () => {
  it('never promotes the unpaid R650 quote over zero collected cents', () => {
    expect(officeBookingPaymentDisplay({amount_paid_cents:0,total_paid_cents:65000,total_paid_zar:650,payment_status:'pending'})).toEqual({collectedCents:0,settled:false});
  });
  it('does not treat missing cash columns or a pending transaction as collected', () => {
    expect(officeBookingPaymentDisplay({total_paid_zar:650,payment_status:'pending'}, {amount_cents:65000,settlement_status:'pending'})).toEqual({collectedCents:0,settled:false});
  });
  it('preserves exact authoritative cents over stale rounded mirrors', () => {
    expect(officeBookingCollectedCents({amount_paid_cents:65049,total_paid_cents:65000,total_paid_zar:650,payment_status:'success'})).toBe(65049);
  });
  it('retains confirmed historical settlement fallback, including explicit mirror zero', () => {
    expect(officeBookingCollectedCents({total_paid_zar:650,payment_status:'success'})).toBe(65000);
    expect(officeBookingCollectedCents({total_paid_cents:0,total_paid_zar:650,payment_status:'success'})).toBe(0);
  });
  it('retains R0 covered settlement without inventing a cash payment', () => {
    expect(officeBookingPaymentDisplay({amount_paid_cents:0,total_paid_zar:650,payment_status:'success'})).toEqual({collectedCents:0,settled:true});
  });
  it('uses confirmed transaction cash and ignores failed/reversed/refund attempts', () => {
    expect(officeBookingPaymentDisplay({amount_paid_cents:0,payment_status:'pending'},{amount_cents:65000,settlement_status:'settled'})).toEqual({collectedCents:65000,settled:true});
    for (const payment of [{settlement_status:'failed'},{settlement_status:'reversed'},{payment_channel:'refund'}]) expect(officeBookingPaymentDisplay({amount_paid_cents:0,payment_status:'pending'},{amount_cents:65000,paid_at:'2026-10-15',...payment})).toEqual({collectedCents:0,settled:false});
  });
});

it('preserves canonical succeeded historical payment status', () => {
  expect(officeBookingPaymentDisplay({payment_status:'succeeded',total_paid_zar:650})).toEqual({collectedCents:65000,settled:true});
});

it('does not treat monthly billing authorization as collected cash', () => {
  expect(officeBookingPaymentDisplay({payment_status:'pending_monthly',amount_paid_cents:0,total_paid_zar:650})).toEqual({collectedCents:0,settled:false});
  expect(officeBookingPaymentDisplay({payment_status:'pending_monthly',total_paid_zar:650})).toEqual({collectedCents:0,settled:false});
});
