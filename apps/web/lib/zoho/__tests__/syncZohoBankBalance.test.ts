import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn(), log: vi.fn() }));
vi.mock('@/lib/zoho/zohoBooksClient', () => ({ zohoBooksClient: { getWithTokenRecovery: mocks.get } }));
vi.mock('@/lib/logging/systemLog', () => ({ logSystemEvent: mocks.log }));
import { syncZohoBankBalance } from '../syncZohoBankBalance';

const bank = { account_id:'101',account_name:'Synthetic bank',account_type:'bank',currency_code:'ZAR',is_active:true };
let detail: Record<string, unknown>;
let update: ReturnType<typeof vi.fn>;
function db() {
  update = vi.fn(() => ({eq:vi.fn(async()=>({error:null}))}));
  return {from:vi.fn(()=>({select:()=>({eq:()=>({eq:async()=>({data:[{id:'local-bank',name:'Synthetic bank',balance_cents:0}],error:null})})}),update}))} as never;
}
beforeEach(()=>{
  vi.resetAllMocks();
  for (const name of ['ZOHO_CLIENT_ID','ZOHO_CLIENT_SECRET','ZOHO_REFRESH_TOKEN','ZOHO_ORGANIZATION_ID']) vi.stubEnv(name,'synthetic');
  vi.stubEnv('ZOHO_BANK_ACCOUNT_ID','101');
  vi.stubEnv('SHALEAN_APP_ENV','production');
  detail={...bank,is_feeds_active:true,feeds_last_refresh_date:new Date().toISOString(),bank_balance:123.45};
  mocks.get.mockImplementation(async(path:string)=>path.startsWith('/bankaccounts?')?{bankaccounts:[bank]}:{bankaccount:detail});
});
afterEach(()=>vi.unstubAllEnvs());
describe('selected bank detail verification',()=>{
  it('fails closed in staging before any provider or database access', async () => {
    vi.stubEnv('SHALEAN_APP_ENV', 'staging');
    const admin = { from: vi.fn(() => { throw new Error('Unexpected staging DB access'); }) };
    const result = await syncZohoBankBalance(admin as never);
    expect(result).toEqual({ ok: false, configured: false, error: 'zoho_bank_sync_blocked_nonproduction' });
    expect(admin.from).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.log).not.toHaveBeenCalled();
  });
  it('reads omitted feed metadata and current balance from the matching detail',async()=>{
    const result=await syncZohoBankBalance(db(),'synthetic-owner');
    expect(result.ok).toBe(true);expect(result.balance_cents).toBe(12345);
    expect(mocks.get).toHaveBeenNthCalledWith(2,'/bankaccounts/101');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({balance_cents:12345}));
  });
  it.each([
    {is_feeds_active:false},
    {feeds_last_refresh_date:'2020-01-01'},
    {account_id:'999'},
    {is_active:false},
    {account_type:'credit_card'},
    {currency_code:'USD'},
    {bank_balance:-1},
  ])('retains the old balance for unsafe detail %j',async(change)=>{
    detail={...detail,...change};
    const result=await syncZohoBankBalance(db());
    expect(result.ok).toBe(false);expect(update).not.toHaveBeenCalled();expect(mocks.log).not.toHaveBeenCalled();
  });
  it('retains the old balance when detail lookup fails',async()=>{
    mocks.get.mockRejectedValue(new Error('Provider unavailable'));
    expect((await syncZohoBankBalance(db())).ok).toBe(false);expect(update).not.toHaveBeenCalled();
  });
});
