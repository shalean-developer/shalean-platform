import { afterEach, expect, it, vi } from 'vitest';
const { get } = vi.hoisted(() => ({ get:vi.fn() }));
vi.mock('@/lib/zoho/zohoBooksClient',()=>({zohoBooksClient:{getWithTokenRecovery:get}}));
import { loadCashReconciliation } from '../loadCashReconciliation';
import { CASH_ACCOUNT_MAPPING } from '@/lib/admin/expenses/cashReconciliation';
afterEach(()=>{ vi.unstubAllEnvs(); vi.resetAllMocks(); });
it('staging scenarios do not access Zoho or import live account identities',async()=>{
  vi.stubEnv('SHALEAN_APP_ENV','staging');
  for(const scenario of ['differences','equal','missing','stale']) {
    const s=await loadCashReconciliation(scenario); expect(s.synthetic).toBe(true); expect(s.safeToSpendCents).toBeNull();
    expect(s.accounts.every(a=>a.id.startsWith('synthetic-'))).toBe(true);
  }
  expect(get).not.toHaveBeenCalled();
});
it('unknown environment and wrong organisation fail closed before provider access',async()=>{
  vi.stubEnv('SHALEAN_APP_ENV','unknown'); expect((await loadCashReconciliation()).complete).toBe(false);
  vi.stubEnv('SHALEAN_APP_ENV','production'); vi.stubEnv('ZOHO_ORGANIZATION_ID','other');
  expect((await loadCashReconciliation()).bankCents).toBeNull(); expect(get).not.toHaveBeenCalled();
});
it('reads exact mapped account details using GET only; failures cannot become zero cash',async()=>{
  vi.stubEnv('SHALEAN_APP_ENV','production');vi.stubEnv('ZOHO_ORGANIZATION_ID','927500285');
  const now = new Date('2026-11-08T10:00:00Z');
  get.mockImplementation(async(path:string)=>{
    const a=CASH_ACCOUNT_MAPPING.find(a=>path===`/bankaccounts/${a.id}`);
    if(!a) throw Error('missing');
    return {bankaccount:{account_id:a.id,account_name:a.name,account_type:'bank',currency_code:'ZAR',is_active:true,is_feeds_active:true,feeds_last_refresh_date:now.toISOString(),bank_balance:100,balance:105}};
  });
  const s=await loadCashReconciliation('differences',now);expect(s.bankCents).toBe(40000);expect(s.differenceCents).toBeNull();expect(s.comparable).toBe(false);expect(s.accounts.every(a=>a.bankBalanceBasis==='unknown')).toBe(true);
  expect(s.processorLedgerCents).toBeNull();expect(s.safeToSpendCents).toBeNull();
  expect(get).toHaveBeenCalledTimes(6);
  get.mockRejectedValue(Error('offline'));expect((await loadCashReconciliation()).bankCents).toBeNull();
});

