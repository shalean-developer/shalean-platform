import { afterEach, expect, it, vi } from 'vitest';
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../zohoBooksClient', () => ({ zohoBooksClient: { getWithTokenRecovery: get } }));
import { loadProtectedCashEvidence } from '../loadProtectedCashEvidence';
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
function production() { vi.stubEnv('SHALEAN_APP_ENV', 'production'); vi.stubEnv('ZOHO_ORGANIZATION_ID', '927500285'); }
function account(path: string, balance = 123.45) { return { code: 0, account_id: path.split('/').pop(), account_type: 'other_current_liability', currency_code: 'ZAR', is_active: true, closing_balance: balance }; }
it('isolates synthetic staging and fails closed for unknown environment/org without finance reads', async () => {
  vi.stubEnv('SHALEAN_APP_ENV', 'staging'); expect((await loadProtectedCashEvidence()).synthetic).toBe(true);
  vi.stubEnv('SHALEAN_APP_ENV', 'unknown'); expect((await loadProtectedCashEvidence()).accounts.every(a => a.balanceCents === null)).toBe(true);
  production(); vi.stubEnv('ZOHO_ORGANIZATION_ID', 'other'); await loadProtectedCashEvidence(); expect(get).not.toHaveBeenCalled();
});
it('reads exact account IDs, preserves a signed debit and never certifies an additive protected total', async () => {
  production(); get.mockImplementation(async (p: string) => account(p, p.endsWith('482529') ? 123.45 : -10));
  const result = await loadProtectedCashEvidence(); expect(result.accounts.map(a => a.balanceCents)).toEqual([12345, -1000]);
  for (const a of result.accounts) expect(Number.isFinite(Date.parse(a.readAt!))).toBe(true);
  expect(get.mock.calls.map(c => c[0])).toEqual(['/chartofaccounts/253016000000482529', '/chartofaccounts/253016000000005001']);
  expect(result).toMatchObject({ reconciled: false, protectedTotalCents: null, spendableCents: null, runwayDays: null });
});
it.each(['account_id', 'account_type', 'currency_code', 'is_active', 'closing_balance'])('rejects invalid %s independently without hiding the other source', async field => {
  production(); get.mockImplementation(async (p: string) => p.endsWith('482529') ? { ...account(p), [field]: field === 'closing_balance' ? null : 'wrong' } : account(p));
  const result = await loadProtectedCashEvidence(); expect(result.accounts[0]).toMatchObject({ balanceCents: null, readAt: null }); expect(result.accounts[1].balanceCents).toBe(12345);
});
it('keeps a successful source when the other API read fails', async () => {
  production(); get.mockImplementation(async (p: string) => { if (p.endsWith('482529')) throw Error('source down'); return account(p); });
  expect((await loadProtectedCashEvidence()).accounts.map(a => a.balanceCents)).toEqual([null, 12345]);
});
