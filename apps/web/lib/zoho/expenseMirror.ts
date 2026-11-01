/** Pure validation and projection for Zoho-owned expense records. */
export type ProviderRow = Record<string, unknown>;
export type MirroredExpense = {
  id: string; date: string; account_id: string; category: string; account_type: string;
  paid_through_account_id: string; paid_through: string; vendor: string;
  description: string; reference: string; status: string; currency: string;
  amount_cents: number; operating: boolean; exclusion: string | null; raw: ProviderRow;
};
export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function validateExpensePeriod(from: string, to: string) {
  if (!validDate(from) || !validDate(to) || from > to ||
      (Date.parse(to) - Date.parse(from)) / 86400000 > 366) {
    throw new Error('Choose a valid date range of at most 367 days.');
  }
}
export async function readCompleteZohoPages(
  endpoint: 'expenses' | 'chartofaccounts', params: Record<string, string>,
  get: (path: string) => Promise<ProviderRow>,
): Promise<ProviderRow[]> {
  const result: ProviderRow[] = [], seen = new Set<string>();
  for (let page = 1; page <= 50; page++) {
    const query = new URLSearchParams({ ...params, per_page: '200', page: String(page) });
    const response = await get(`/${endpoint}?${query}`);
    const rows = response[endpoint];
    if (!Array.isArray(rows) || rows.length > 200) throw new Error('Invalid Zoho page. Retry the sync.');
    const context = Array.isArray(response.page_context) ?
      (response.page_context.length === 1 ? response.page_context[0] : null) : response.page_context;
    if (!context || typeof context !== 'object' || Array.isArray(context)) throw new Error('Missing Zoho pagination evidence.');
    const meta = context as ProviderRow;
    if (Number(meta.page) !== page || (meta.has_more_page !== undefined && typeof meta.has_more_page !== 'boolean'))
      throw new Error('Invalid Zoho pagination evidence.');
    const limit = meta.per_page === undefined ? 200 : Number(meta.per_page);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200 || rows.length > limit)
      throw new Error('Invalid Zoho page size.');
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Invalid Zoho record.');
      const rawId = row[endpoint === 'expenses' ? 'expense_id' : 'account_id'];
      if (typeof rawId === 'number' && !Number.isSafeInteger(rawId)) throw new Error('Unsafe numeric Zoho ID.');
      const id = String(rawId ?? '');
      if (!/^\d+$/.test(id) || seen.has(id)) throw new Error('Missing or repeated Zoho ID. Retry the sync.');
      seen.add(id); result.push(row);
    }
    if (meta.has_more_page === false || (meta.has_more_page === undefined && rows.length < limit)) return result;
    if (!rows.length) throw new Error('Incomplete Zoho page.');
  }
  throw new Error('Zoho import exceeds 10,000 records. Choose a smaller date range.');
}
export function projectZohoExpenses(rows: ProviderRow[], accounts: ProviderRow[], from: string, to: string): MirroredExpense[] {
  validateExpensePeriod(from, to);
  return rows.map(raw => {
    const date = String(raw.date ?? '');
    if (!validDate(date) || date < from || date > to) throw new Error('Zoho returned an expense outside the requested period.');
    const candidates = accounts.filter(a => raw.account_id ? String(a.account_id) === String(raw.account_id) : a.account_name === raw.account_name);
    const account = candidates.length === 1 ? candidates[0] : undefined;
    const type = String(account?.account_type ?? 'unknown');
    const currency = String(raw.currency_code ?? '');
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Zoho returned an invalid expense currency.');
    const total = raw.total;
    if ((typeof total !== 'number' && typeof total !== 'string') || total === '' ||
        !Number.isFinite(Number(total)) || Number(total) < 0 || !Number.isSafeInteger(Math.round(Number(total) * 100)))
      throw new Error('Zoho returned an invalid expense total.');
    const operating = ['expense', 'cost_of_goods_sold', 'other_expense'].includes(type) && raw.is_personal !== true;
    return {
      id: String(raw.expense_id), date, account_id: String(account?.account_id ?? raw.account_id ?? ''),
      category: String(raw.account_name ?? ''), account_type: type,
      paid_through_account_id: String(raw.paid_through_account_id ?? ''),
      paid_through: String(raw.paid_through_account_name ?? ''), vendor: String(raw.vendor_name ?? ''),
      description: String(raw.description ?? ''), reference: String(raw.reference_number ?? ''),
      status: String(raw.status ?? ''), currency, amount_cents: Math.round(Number(total) * 100),
      operating: operating && currency === 'ZAR',
      exclusion: currency !== 'ZAR' ? 'Non-ZAR — excluded from ZAR total' : operating ? null :
        type === 'unknown' ? 'Account classification requires review' : 'Non-operating account or personal expense', raw,
    };
  });
}
