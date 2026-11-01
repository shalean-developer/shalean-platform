import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn(), acquire: vi.fn(), release: vi.fn() }));
vi.mock('@/lib/zoho/zohoBooksClient', () => ({ zohoBooksClient: { getWithTokenRecovery: mocks.get } }));
vi.mock('@/lib/cron/cronLock', () => ({ acquireCronLock: mocks.acquire, releaseCronLock: mocks.release }));
import { expenseMirrorOrganization, syncExpenseMirror } from '../syncExpenseMirror';
const env = { SHALEAN_APP_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'https://paqjwfulwywtsyyvdxrq.supabase.co', ZOHO_ORGANIZATION_ID: '927500285' };
let saved: Record<string, unknown>, updates: Record<string, unknown>[];
function db() {
  return { from: vi.fn((table: string) => {
    expect(table).toBe('zoho_expense_period_mirror');
    return {
      upsert: vi.fn(async (_value, options) => { expect(options.ignoreDuplicates).toBe(true); return { error: null }; }),
      update: (value: Record<string, unknown>) => ({ match: async () => {
        updates.push(value); saved = { ...saved, ...value }; return { error: null };
      } }),
    };
  }) } as never;
}
beforeEach(() => {
  vi.resetAllMocks(); for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  saved = { records: [{ id: 'old' }], last_success_at: '2026-10-01T00:00:00Z' }; updates = [];
  mocks.acquire.mockResolvedValue({ ok: true, jobName: 'test', holderId: 'test', leaseSeconds: 600 });
  mocks.get.mockImplementation(async (path: string) => path.startsWith('/chartofaccounts') ? {
    chartofaccounts: [{ account_id: '1', account_name: 'Fuel', account_type: 'expense' }], page_context: { page: 1, has_more_page: false },
  } : { expenses: [{ expense_id: '101', is_personal: false, account_id: '1', date: '2026-10-02', total: 100.01, currency_code: 'ZAR' }], page_context: { page: 1, has_more_page: false } });
});
afterEach(() => vi.unstubAllEnvs());
describe('safe expense snapshot refresh', () => {
  it('hydrates personal status omitted from the list and excludes personal expenses', async () => {
    mocks.get.mockImplementation(async (path: string) => {
      if (path.startsWith('/chartofaccounts?')) return { chartofaccounts: [{account_id:'1',account_name:'Fuel',account_type:'expense'}], page_context:{page:1,has_more_page:false} };
      if (path === '/expenses/101') return { expense: {expense_id:'101',is_personal:true} };
      return { expenses:[{expense_id:'101',account_id:'1',date:'2026-10-02',total:100,currency_code:'ZAR'}],page_context:{page:1,has_more_page:false} };
    });
    await syncExpenseMirror(db(), '2026-10-01', '2026-10-31');
    expect((saved.records as {operating:boolean}[])[0].operating).toBe(false);
    expect(mocks.get).toHaveBeenCalledWith('/expenses/101');
  });
  it('keeps the old snapshot if a detail response has the wrong identity', async () => {
    mocks.get.mockImplementation(async (path: string) => path.startsWith('/chartofaccounts?') ? {chartofaccounts:[],page_context:{page:1,has_more_page:false}} : path === '/expenses/101' ? {expense:{expense_id:'999',is_personal:false}} : {expenses:[{expense_id:'101',date:'2026-10-02',total:100,currency_code:'ZAR'}],page_context:{page:1,has_more_page:false}});
    await expect(syncExpenseMirror(db(), '2026-10-01', '2026-10-31')).rejects.toThrow();
    expect(saved.records).toEqual([{id:'old'}]);
  });

  it('replaces rather than appends, so repeat imports and changed amounts never duplicate', async () => {
    const admin = db(); await syncExpenseMirror(admin, '2026-10-01', '2026-10-31'); await syncExpenseMirror(admin, '2026-10-01', '2026-10-31');
    expect(saved.records).toHaveLength(1); expect((saved.records as {amount_cents:number}[])[0].amount_cents).toBe(10001);
    expect(mocks.release).toHaveBeenCalledTimes(2);
    expect(mocks.get.mock.calls.every(([path]) => path.startsWith('/expenses?') || path.startsWith('/chartofaccounts?'))).toBe(true);
  });
  it('keeps the last complete snapshot on provider failure and persists an actionable redacted error', async () => {
    mocks.get.mockRejectedValue(new Error('secret-token synthetic-secret'));
    await expect(syncExpenseMirror(db(), '2026-10-01', '2026-10-31')).rejects.toThrow('last complete snapshot');
    expect(saved.records).toEqual([{ id: 'old' }]); expect(saved.last_success_at).toBe('2026-10-01T00:00:00Z');
    expect(saved.last_error).not.toContain('synthetic-secret'); expect(mocks.release).toHaveBeenCalledOnce();
  });
  it.each([{ok:false}, {ok:true,degraded:true}])('refuses overlap and degraded locks before changing cache', async lock => {
    mocks.acquire.mockResolvedValue(lock);
    await expect(syncExpenseMirror(db(), '2026-10-01', '2026-10-31')).rejects.toThrow('lock');
    expect(updates).toHaveLength(0); expect(mocks.get).not.toHaveBeenCalled();
  });
  it('empty complete results remove deleted or moved records only from the projection', async () => {
    mocks.get.mockResolvedValue({ expenses: [], chartofaccounts: [], page_context: {page:1,has_more_page:false} });
    await syncExpenseMirror(db(), '2026-10-01', '2026-10-31'); expect(saved.records).toEqual([]);
  });
});
describe('environment isolation', () => {
  it('accepts only the production identity and Shalean organisation together', () => expect(expenseMirrorOrganization(env)).toBe('927500285'));
  it('rejects unknown databases and wrong organisations', () => {
    expect(() => expenseMirrorOrganization({...env, ZOHO_ORGANIZATION_ID:'123'})).toThrow();
    expect(() => expenseMirrorOrganization({...env, NEXT_PUBLIC_SUPABASE_URL:'https://unknown.supabase.co'})).toThrow();
  });
  it('refuses staging access to the production organisation or database', () => {
    expect(() => expenseMirrorOrganization({...env, SHALEAN_APP_ENV:'staging', SHALEAN_EXPECTED_SUPABASE_REF:'paqjwfulwywtsyyvdxrq'})).toThrow();
    expect(() => expenseMirrorOrganization({...env, SHALEAN_APP_ENV:'staging', NEXT_PUBLIC_SUPABASE_URL:'https://uwvnmluiqbczeduzjgse.supabase.co', ZOHO_EXPENSE_IMPORT_TEST_ORG_ID:'927500285'})).toThrow();
  });
  it('allows a separate explicitly configured staging test organisation', () => {
    expect(expenseMirrorOrganization({...env, SHALEAN_APP_ENV:'staging', SHALEAN_EXPECTED_SUPABASE_REF:'uwvnmluiqbczeduzjgse', NEXT_PUBLIC_SUPABASE_URL:'https://uwvnmluiqbczeduzjgse.supabase.co', ZOHO_ORGANIZATION_ID:'123', ZOHO_EXPENSE_IMPORT_TEST_ORG_ID:'123'})).toBe('123');
  });
});
