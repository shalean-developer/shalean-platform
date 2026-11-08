import { afterEach, expect, it, vi } from 'vitest';
const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/lib/zoho/zohoBooksClient', () => ({ zohoBooksClient: { post } }));
import { createZohoExpense, markZohoInvoicePaid } from '@/lib/zoho/zohoBooksService';
import { zohoPaystackClearingAccountId } from '@/lib/zoho/zohoWebsiteReceiptAccount';
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
const payment = { contactId:'synthetic-contact', zohoInvoiceId:'synthetic-invoice', amountZar:458, paymentDate:'2026-11-07', reference:'synthetic-reference' };
it('puts a verified Paystack receipt in Clearing while preserving its original allocation', async () => {
  vi.stubEnv('SHALEAN_APP_ENV','production'); vi.stubEnv('ZOHO_PAYSTACK_CLEARING_ACCOUNT_ID','');
  post.mockResolvedValue({payment:{payment_id:'synthetic-payment'}});
  expect(await markZohoInvoicePaid({...payment,paymentSource:'paystack'})).toEqual({ok:true,paymentId:'synthetic-payment'});
  expect(post).toHaveBeenCalledWith('/customerpayments',expect.objectContaining({account_id:'253016000000482521',amount:458,date:'2026-11-07',invoices:[{invoice_id:'synthetic-invoice',amount_applied:458}]}));
});
it('preserves direct payment account selection instead of assuming every receipt is Paystack', async () => {
  post.mockResolvedValue({payment:{payment_id:'synthetic-payment'}});
  await markZohoInvoicePaid(payment);
  expect(post.mock.calls[0][1]).not.toHaveProperty('account_id');
});
it('uses Clearing as the fee funding account without changing the expense category or amount', async () => {
  post.mockResolvedValue({expense:{expense_id:'synthetic-expense'}});
  await createZohoExpense({accountId:'synthetic-fee-category',paidThroughAccountId:'synthetic-clearing',date:'2026-11-07',amountZar:16.44});
  expect(post).toHaveBeenCalledWith('/expenses',expect.objectContaining({account_id:'synthetic-fee-category',paid_through_account_id:'synthetic-clearing',amount:16.44}));
});
it.each(['staging','development','test'])('requires an explicit test Clearing identity in %s',environment=>{
  vi.stubEnv('SHALEAN_APP_ENV',environment); vi.stubEnv('ZOHO_PAYSTACK_CLEARING_ACCOUNT_ID','');
  expect(()=>zohoPaystackClearingAccountId()).toThrow('zoho_paystack_clearing_account_id_required_for_nonproduction');
  vi.stubEnv('ZOHO_PAYSTACK_CLEARING_ACCOUNT_ID','synthetic-clearing');
  expect(zohoPaystackClearingAccountId()).toBe('synthetic-clearing');
});
