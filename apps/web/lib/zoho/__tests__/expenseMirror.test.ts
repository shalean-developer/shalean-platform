import { describe, it, expect } from 'vitest';
import { projectZohoExpenses, readCompleteZohoPages, validateExpensePeriod } from '../expenseMirror';
const account = (id: string, name: string, type: string) => ({ account_id: id, account_name: name, account_type: type });
const accounts = [account('1', 'Fuel', 'expense'), account('2', 'Internal Transfers Clearing', 'other_current_asset'), account('3', 'Director Loan', 'other_current_liability')];
const row = (id = '101', category = 'Fuel') => ({ expense_id: id, date: '2026-10-30', total: 456.13, currency_code: 'ZAR', account_name: category, paid_through_account_name: 'Paystack Clearing', reference_number: 'synthetic-ref' });
const project = (rows: Record<string, unknown>[]) => projectZohoExpenses(rows, accounts, '2026-10-01', '2026-10-31');
describe('Zoho expense ownership and classification', () => {
  it('retains precise cents, payment account, reference and raw evidence', () => {
    const input = row(); const result = project([input])[0];
    expect(result).toMatchObject({ id: '101', amount_cents: 45613, operating: true, paid_through: 'Paystack Clearing', reference: 'synthetic-ref', raw: input });
  });
  it('excludes transfer assets, director loans and unknown categories', () => {
    expect(project([row('1', 'Internal Transfers Clearing'), row('2', 'Director Loan'), row('3', 'Unknown')]).every(r => !r.operating)).toBe(true);
  });
  it('excludes personal and foreign currency values from ZAR operating total', () => {
    expect(project([{ ...row(), is_personal: true }, { ...row('102'), currency_code: 'USD' }]).every(r => !r.operating)).toBe(true);
  });
  it('refuses ambiguous category names', () => {
    expect(projectZohoExpenses([row()], [...accounts, account('4', 'Fuel', 'other_current_asset')], '2026-10-01', '2026-10-31')[0].operating).toBe(false);
  });
  it.each(['2026-02-30', '', '2026-11-01'])('rejects invalid or out-of-window dates %s', date => expect(() => project([{ ...row(), date }])).toThrow());
  it.each([null, '', -1, 'NaN', Infinity])('rejects malformed total %s', total => expect(() => project([{ ...row(), total }])).toThrow());
  it('validates calendar ranges and maximum window', () => {
    expect(() => validateExpensePeriod('2026-10-31', '2026-10-01')).toThrow();
    expect(() => validateExpensePeriod('2020-01-01', '2026-10-31')).toThrow();
  });
});
describe('complete provider pagination', () => {
  it('walks full and short pages and accepts object or singleton-array contexts', async () => {
    const paths: string[] = [];
    const result = await readCompleteZohoPages('expenses', {}, async path => {
      paths.push(path); const page = Number(new URLSearchParams(path.split('?')[1]).get('page'));
      return page === 1 ? { expenses: [row('1')], page_context: { page: 1, per_page: 1, has_more_page: true } } :
        { expenses: [row('2')], page_context: [{ page: 2, per_page: 200, has_more_page: false }] };
    });
    expect(result).toHaveLength(2); expect(paths[1]).toContain('page=2');
  });
  it('fails without publishing an incomplete result when page two fails', async () => {
    let calls = 0;
    await expect(readCompleteZohoPages('expenses', {}, async () => {
      if (++calls === 2) throw new Error('provider failure');
      return { expenses: [row()], page_context: { page: 1, has_more_page: true } };
    })).rejects.toThrow('provider failure');
  });
  it('rejects repeat IDs across pages', async () => {
    let page = 0;
    await expect(readCompleteZohoPages('expenses', {}, async () => ({ expenses: [row()], page_context: { page: ++page, has_more_page: true } }))).rejects.toThrow('repeated');
  });
  it.each([undefined, [], { page: 2 }, { page: 1, has_more_page: 'false' }])('rejects malformed pagination', async page_context => {
    await expect(readCompleteZohoPages('expenses', {}, async () => ({ expenses: [row()], page_context }))).rejects.toThrow();
  });
  it('accepts a proved empty result so removed records can disappear', async () => {
    expect(await readCompleteZohoPages('expenses', {}, async () => ({ expenses: [], page_context: { page: 1, has_more_page: false } }))).toEqual([]);
  });
});
